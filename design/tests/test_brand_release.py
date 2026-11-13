"""Release/website separation, without network access or artwork rendering."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import brand_release as BRAND

PREPARE = BRAND.load_script("prepare-brand-site")
PUBLISH = BRAND.load_script("publish-brand-release")


def remote_release(release, draft=False):
    assets = [{"name": record["releaseAsset"], "size": record["bytes"],
               "digest": f"sha256:{record['sha256']}"} for record in release["assets"]]
    metadata = (json.dumps(release, indent=2) + "\n").encode()
    assets += [{"name": "brand-release.json", "digest": "sha256:" + hashlib.sha256(metadata).hexdigest()},
               {"name": BRAND.KIT_NAME, "size": 100}]
    return {"draft": draft, "body": f"Brand inventory SHA-256: {release['fingerprint']}", "assets": assets}


class BrandReleaseTest(unittest.TestCase):
    def test_inventory_is_deterministic_complete_and_has_safe_unique_names(self):
        release = BRAND.inventory()
        self.assertRegex(release["tag"], r"^brand-[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]*$")
        self.assertEqual(release, BRAND.inventory())
        names = [record["releaseAsset"] for record in release["assets"]]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(sum(name.endswith(".mov") for name in names), 12)
        for record in release["assets"]:
            self.assertRegex(record["releaseAsset"], r"^[A-Za-z0-9._-]+$")
            self.assertIn(f"/download/{release['tag']}/", record["download"])
            self.assertTrue(record["download"].endswith(record["releaseAsset"]))

    def test_content_changes_require_a_new_edition_and_no_preview_fields_are_fingerprinted(self):
        original = BRAND.inventory()
        records = BRAND.asset_records()
        records[0]["sha256"] = "changed"
        with patch.object(BRAND, "asset_records", return_value=records):
            changed = BRAND.inventory()
            self.assertNotEqual(original["fingerprint"], changed["fingerprint"])
            self.assertEqual(original["tag"], changed["tag"], "Dates/revisions are explicit; the publisher refuses reuse for a different fingerprint")
        self.assertFalse(any("preview" in record for record in original["assets"]))

    def test_website_contains_small_previews_not_originals_or_zip(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            photo = root / "photo.jpg"
            Image.new("RGB", (1600, 800), "green").save(photo)
            (root / "original.mov").write_bytes(b"approved video")
            records = [{"file": "images/photo.jpg", "source": "photo.jpg", "releaseAsset": "images--photo.jpg", "sha256": "photo"},
                       {"file": "video/original.mov", "source": "original.mov", "releaseAsset": "video--original.mov", "sha256": "video"}]
            target = root / "public/brand-assets"
            (target / "files/images").mkdir(parents=True)
            (target / "files/images/photo.jpg").write_bytes(photo.read_bytes())
            (target / "files/recipient-notes.txt").write_text("keep")
            (target / BRAND.KIT_NAME).write_bytes(b"old ZIP")
            (target / "catalog.json").write_text(json.dumps(records))
            with patch.object(PREPARE, "ROOT", root), patch.object(PREPARE, "check_artwork") as check, \
                 patch.object(PREPARE, "inventory", side_effect=lambda: {"assets": copy.deepcopy(records), "tag": "test"}):
                PREPARE.prepare()
                PREPARE.prepare()
                self.assertEqual(check.call_count, 2)
            self.assertFalse((target / BRAND.KIT_NAME).exists())
            self.assertFalse((target / "files/images/photo.jpg").exists())
            self.assertEqual((target / "files/recipient-notes.txt").read_text(), "keep")
            catalogue = json.loads((target / "catalog.json").read_text())
            self.assertNotIn("preview", catalogue[1])
            for width in (240, 480, 720):
                preview = target / f"previews/images--photo.jpg-{width}.webp"
                with Image.open(preview) as image:
                    self.assertLessEqual(image.width, width)
                self.assertLess(preview.stat().st_size, 200_000)
            self.assertEqual((root / "original.mov").read_bytes(), b"approved video")

    def test_existing_release_skips_packaging_and_uploads(self):
        release = BRAND.inventory()
        with patch.object(PUBLISH, "check_artwork"), patch.object(PUBLISH, "inventory", return_value=release), \
             patch.object(PUBLISH, "find_release", return_value=remote_release(release)), \
             patch.object(PUBLISH, "load_script") as package, patch.object(PUBLISH, "gh") as gh:
            PUBLISH.publish()
            package.assert_not_called()
            gh.assert_not_called()

    def test_published_release_checksums_and_missing_attachments_block_deployment(self):
        release = BRAND.inventory()
        for mutation in ("missing", "checksum", "metadata", "zip"):
            remote = remote_release(release)
            if mutation == "missing":
                remote["assets"].pop(0)
            elif mutation == "checksum":
                remote["assets"][0]["digest"] = "sha256:bad"
            elif mutation == "metadata":
                remote["assets"][-2]["digest"] = "sha256:bad"
            else:
                remote["assets"][-1]["size"] = 0
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                PUBLISH.validate_release(remote, release)

    def test_release_attachments_are_paginated(self):
        response = Mock(returncode=0, stdout=json.dumps({"id": 42}), stderr="")
        with patch.object(PUBLISH.subprocess, "run", return_value=response), \
             patch.object(PUBLISH, "gh", return_value=json.dumps([[{"name": "one"}], [{"name": "two"}]])) as gh:
            remote = PUBLISH.find_release("test")
            self.assertEqual(len(remote["assets"]), 2)
            self.assertIn("--paginate", gh.call_args.args)

    def test_api_errors_are_not_mistaken_for_missing_releases(self):
        response = Mock(returncode=1, stderr="HTTP 403: forbidden")
        with patch.object(PUBLISH.subprocess, "run", return_value=response), self.assertRaises(RuntimeError):
            PUBLISH.find_release("test")

    def test_draft_lookup_falls_back_to_paginated_release_listing(self):
        response = Mock(returncode=1, stderr="HTTP 404: Not Found")
        pages = [[{"id": 1, "tag_name": "other", "draft": True}],
                 [{"id": 42, "tag_name": "test", "draft": True}]]
        with patch.object(PUBLISH.subprocess, "run", return_value=response), \
             patch.object(PUBLISH, "gh", side_effect=[json.dumps(pages), json.dumps([[{"name": "one"}], [{"name": "two"}]])]) as gh:
            remote = PUBLISH.find_release("test")
            self.assertEqual(remote["id"], 42)
            self.assertTrue(remote["draft"])
            self.assertEqual(len(remote["assets"]), 2)
            self.assertIn("/releases?per_page=100", gh.call_args_list[0].args[1])
            self.assertIn("/releases/42/assets?per_page=100", gh.call_args_list[1].args[1])
            self.assertTrue(all("--paginate" in call.args for call in gh.call_args_list))

    def test_missing_release_requires_successful_draft_lookup(self):
        response = Mock(returncode=1, stderr="HTTP 404: Not Found")
        with patch.object(PUBLISH.subprocess, "run", return_value=response), \
             patch.object(PUBLISH, "gh", return_value="[[]]"):
            self.assertIsNone(PUBLISH.find_release("test"))
        with patch.object(PUBLISH.subprocess, "run", return_value=response), \
             patch.object(PUBLISH, "gh", side_effect=RuntimeError("HTTP 403: forbidden")), self.assertRaises(RuntimeError):
            PUBLISH.find_release("test")

    def test_missing_release_validation_blocks_publication(self):
        with self.assertRaisesRegex(ValueError, "Brand release not found"):
            PUBLISH.validate_release(None, {})

    def test_new_release_is_uploaded_and_verified_as_draft_before_publication(self):
        release = BRAND.inventory()
        def package(output):
            output.mkdir()
            (output / BRAND.KIT_NAME).write_bytes(b"test ZIP")
        with patch.object(PUBLISH, "check_artwork"), patch.object(PUBLISH, "inventory", return_value=release), \
             patch.object(PUBLISH, "find_release", side_effect=[None, None, remote_release(release, draft=True)]), \
             patch.object(PUBLISH, "load_script", return_value=Mock(build=package)), \
             patch.object(PUBLISH, "gh") as gh, patch.dict("os.environ", {"GITHUB_SHA": "commit"}):
            PUBLISH.publish()
            calls = [call.args for call in gh.call_args_list]
            self.assertEqual([args[1] for args in calls], ["create", "upload", "edit"])
            self.assertIn("--draft", calls[0])
            self.assertEqual(calls[0][calls[0].index("--title") + 1], "City Changers brand")
            self.assertIn("--draft=false", calls[-1])
            self.assertTrue(all("--latest=false" in args for args in (calls[0], calls[-1])))

    def test_interrupted_draft_upload_never_publishes(self):
        release = BRAND.inventory()
        def package(output):
            output.mkdir()
            (output / BRAND.KIT_NAME).write_bytes(b"test ZIP")
        remote = remote_release(release, draft=True)
        remote["assets"] = []
        with patch.object(PUBLISH, "check_artwork"), patch.object(PUBLISH, "inventory", return_value=release), \
             patch.object(PUBLISH, "find_release", return_value=remote), \
             patch.object(PUBLISH, "load_script", return_value=Mock(build=package)), \
             patch.object(PUBLISH, "gh", side_effect=RuntimeError("interrupted")) as gh, self.assertRaises(RuntimeError):
            PUBLISH.publish()
        self.assertEqual(gh.call_args.args[1], "upload")
        self.assertEqual(gh.call_count, 1)


if __name__ == "__main__":
    unittest.main()
