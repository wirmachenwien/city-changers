"""Offline release transport tests; no GitHub credentials, uploads or TTS."""
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import copy
import hashlib
import os
import subprocess

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import github_release as RELEASE

spec = importlib.util.spec_from_file_location("audio_publisher", SCRIPTS / "audio/publish-release.py")
AUDIO = importlib.util.module_from_spec(spec)
spec.loader.exec_module(AUDIO)


class FakeGitHub:
    """Real staged bytes, entirely in-memory remote operations."""
    def __init__(self, directory):
        self.files = [Path(directory) / name for name in ["01.mp3", "audio-release.json"]]
        for file in self.files:
            file.write_bytes(file.name.encode("utf-8"))
        self.expected = {file.name: {"bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()} for file in self.files}
        self.remote = None
        self.calls = []

    def lookup(self, tag):
        return copy.deepcopy(self.remote)

    def record(self, name):
        record = self.expected[name]
        return {"name": name, "size": record["bytes"], "digest": "sha256:" + record["sha256"]}

    def command(self, *args):
        self.calls.append(args)
        if args[1] == "create":
            self.remote = {"body": "managed", "draft": True, "assets": []}
        elif args[1] == "upload":
            assert "--clobber" not in args
            for file in args[5:]:
                name = Path(file).name
                if any(asset["name"] == name for asset in self.remote["assets"]):
                    raise RuntimeError("Attachment already exists")
                self.remote["assets"].append(self.record(name))
        elif args[1] == "edit":
            self.remote["draft"] = False

    @contextmanager
    def stage(self):
        yield [str(file) for file in self.files]

    def validate(self, remote):
        RELEASE.validate_assets(remote, self.expected)

    def publish(self, **overrides):
        args = dict(repository="test/repo", tag="audio-test", target="commit", title="Audio", notes="Notes", marker="managed",
                    lookup=self.lookup, validate=self.validate, stage=self.stage, command=self.command)
        args.update(overrides)
        return RELEASE.publish_release(**args)


class ReleaseTest(unittest.TestCase):
    def test_published_release_reuse_does_not_stage_or_upload(self):
        validate, stage, gh = Mock(), Mock(), Mock()
        remote = {"body": "managed", "draft": False}
        result = RELEASE.publish_release(repository="test/repo", tag="audio-test", target="commit", title="Audio", notes="Notes",
                                         marker="managed", lookup=Mock(return_value=remote), validate=validate, stage=stage, command=gh)
        self.assertFalse(result)
        validate.assert_called_once_with(remote)
        stage.assert_not_called()
        gh.assert_not_called()

    def test_draft_is_uploaded_verified_then_published(self):
        with tempfile.TemporaryDirectory() as directory:
            github = FakeGitHub(directory)
            def validate(remote):
                self.assertTrue(remote["draft"])
                github.validate(remote)
            self.assertTrue(github.publish(validate=validate))
            self.assertEqual([args[1] for args in github.calls], ["create", "upload", "edit"])
            self.assertIn("--draft", github.calls[0])
            self.assertIn("--latest=false", github.calls[0])
            self.assertIn("--draft=false", github.calls[-1])
            self.assertIn("--latest=false", github.calls[-1])

    def test_failed_validation_never_publishes_and_unknown_releases_are_protected(self):
        with tempfile.TemporaryDirectory() as directory:
            for remote in [{"body": "managed", "draft": True, "assets": []}, {"body": "someone else's release", "draft": False}]:
                github = FakeGitHub(directory)
                github.remote = remote
                with self.assertRaises(ValueError):
                    github.publish(validate=Mock(side_effect=ValueError("bad")))
                self.assertFalse(any(args[1] == "edit" for args in github.calls))

    def test_exact_attachment_checksums_and_sizes(self):
        expected = {"01.mp3": {"bytes": 10, "sha256": "abc"}}
        good = {"assets": [{"name": "01.mp3", "size": 10, "digest": "sha256:abc"}]}
        RELEASE.validate_assets(good, expected)
        for remote in [None, {"assets": []}, {"assets": good["assets"] * 2}, {"assets": [{"name": "01.mp3", "size": 11, "digest": "sha256:abc"}]}]:
            with self.assertRaises(ValueError):
                RELEASE.validate_assets(remote, expected)

    def test_resumed_draft_uploads_only_missing_verified_attachments(self):
        with tempfile.TemporaryDirectory() as directory:
            github = FakeGitHub(directory)
            github.remote = {"body": "managed", "draft": True, "assets": [github.record("01.mp3")]}
            github.publish()
            upload = next(args for args in github.calls if args[1] == "upload")
            self.assertEqual([Path(file).name for file in upload[5:]], ["audio-release.json"])
            self.assertNotIn("--clobber", upload)

    def test_draft_mismatches_are_never_deleted_or_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            for mutation in ["size", "digest", "unexpected", "duplicate"]:
                github = FakeGitHub(directory)
                asset = github.record("01.mp3")
                if mutation == "size":
                    asset["size"] += 1
                elif mutation == "digest":
                    asset["digest"] = "sha256:bad"
                elif mutation == "unexpected":
                    asset["name"] = "other.mp3"
                assets = [asset, asset] if mutation == "duplicate" else [asset]
                github.remote = {"body": "managed", "draft": True, "assets": assets}
                with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                    github.publish()
                self.assertEqual(github.calls, [])

    def test_cross_machine_publication_during_staging_is_reused_without_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            github = FakeGitHub(directory)
            github.remote = {"body": "managed", "draft": True, "assets": []}
            @contextmanager
            def stage():
                github.remote.update(draft=False, assets=[github.record(file.name) for file in github.files])
                yield [str(file) for file in github.files]
            self.assertFalse(github.publish(stage=stage))
            self.assertEqual(github.calls, [])

    def test_cross_machine_upload_race_never_clobbers_and_reuses_only_valid_publications(self):
        with tempfile.TemporaryDirectory() as directory:
            for complete in [True, False]:
                github = FakeGitHub(directory)
                github.remote = {"body": "managed", "draft": True, "assets": []}
                def command(*args):
                    self.assertEqual(args[1], "upload")
                    self.assertNotIn("--clobber", args)
                    github.remote.update(draft=False, assets=[github.record(file.name) for file in github.files] if complete else [])
                    raise RuntimeError("Concurrent upload")
                if complete:
                    self.assertFalse(github.publish(command=command))
                else:
                    with self.assertRaises(ValueError):
                        github.publish(command=command)

    def test_publication_lock_covers_lookup_staging_validation_and_publication_and_releases_after_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            github = FakeGitHub(directory)
            def assert_locked():
                with self.assertRaises(RuntimeError), RELEASE.publication_lock("test/repo", "audio-test"):
                    self.fail("Overlapping publisher acquired the lock")
            def lookup(tag):
                assert_locked()
                return github.lookup(tag)
            @contextmanager
            def stage():
                assert_locked()
                yield [str(file) for file in github.files]
            def command(*args):
                assert_locked()
                github.command(*args)
            def validate(remote):
                assert_locked()
                github.validate(remote)
            github.publish(lookup=lookup, stage=stage, command=command, validate=validate)
            with RELEASE.publication_lock("test/repo", "audio-test"):
                pass
            github.remote = None
            with self.assertRaises(ValueError):
                github.publish(validate=Mock(side_effect=ValueError("failed validation")))
            with RELEASE.publication_lock("test/repo", "audio-test"):
                pass

    def test_publication_locks_are_shared_across_checkouts_and_recover_after_process_exit(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"XDG_CACHE_HOME": directory}):
            script = f"import sys;sys.path.insert(0,{str(SCRIPTS)!r});from github_release import publication_lock;\nwith publication_lock('test/repo','audio-test'): print('locked')"
            with RELEASE.publication_lock("test/repo", "audio-test"):
                result = subprocess.run([sys.executable, "-c", script], cwd=directory, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Another publisher", result.stderr)
            result = subprocess.run([sys.executable, "-c", script], cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            crash = script.replace("print('locked')", "__import__('os')._exit(7)")
            self.assertEqual(subprocess.run([sys.executable, "-c", crash], cwd=directory).returncode, 7)
            with RELEASE.publication_lock("test/repo", "audio-test"):
                pass

    def test_range_check_verifies_start_and_middle_and_rejects_full_responses(self):
        asset = {"download": "https://example.com/test.mp3", "bytes": 10, "releaseAsset": "test.mp3"}
        def response(start):
            value = Mock(status=206, headers={"Content-Range": f"bytes {start}-{start}/10"})
            value.read.return_value = b"x"
            value.__enter__ = Mock(return_value=value)
            value.__exit__ = Mock(return_value=False)
            return value
        with patch.object(AUDIO, "urlopen", side_effect=[response(0), response(5)]) as fetch:
            AUDIO.range_check(asset)
            self.assertEqual([call.args[0].headers["Range"] for call in fetch.call_args_list], ["bytes=0-0", "bytes=5-5"])
        bad = response(0)
        bad.status = 200
        with patch.object(AUDIO, "urlopen", return_value=bad), self.assertRaises(ValueError):
            AUDIO.range_check(asset)

    def test_unstaged_or_untracked_edition_blocks_publishing(self):
        with patch.object(AUDIO, "checked", side_effect=["", "?? audio/release.json"]), self.assertRaisesRegex(ValueError, "Commit the reviewed"):
            AUDIO.require_committed()

    def test_verify_never_requires_private_staging_or_uploads(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "audio").mkdir()
            release = {"repository": "test/repo", "tag": "audio-test", "edition": {"title": "Moč superblokov"}, "fingerprint": "test", "url": "https://example.com/release", "assets": []}
            metadata = json.dumps(release, ensure_ascii=False).encode("utf-8")
            (root / "audio/release.json").write_bytes(metadata)
            import hashlib
            remote = {"draft": False, "prerelease": False, "body": "Audio inventory SHA-256: test", "assets": [
                {"name": AUDIO.METADATA, "size": len(metadata), "digest": "sha256:" + hashlib.sha256(metadata).hexdigest()}]}
            read_text = Path.read_text
            def read_utf8(path, *args, **kwargs):
                self.assertEqual(kwargs.get("encoding"), "utf-8")
                return read_text(path, *args, **kwargs)
            with patch.object(Path, "read_text", read_utf8), patch.object(AUDIO, "ROOT", root), patch.object(AUDIO, "checked", return_value="valid"), \
                 patch.object(AUDIO, "require_committed", return_value="commit"), patch.object(AUDIO, "find_release", return_value=remote), \
                 patch.object(AUDIO, "publish_release") as publish:
                AUDIO.run(verify=True)
                publish.assert_not_called()


    def test_publisher_stages_the_verified_public_audio_handoff_not_private_cache(self):
        import hashlib
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "audio").mkdir()
            file = "aaaaaaaaaaaaaaaaaaaa/en/01.mp3"
            source = root / "public/audio" / file
            source.parent.mkdir(parents=True)
            source.write_bytes(b"public media")
            asset = {"file": file, "bytes": source.stat().st_size, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                     "kind": "mp3", "releaseAsset": "en--01.mp3", "download": "https://example.com/01.mp3"}
            release = {"repository": "test/repo", "tag": "audio-test", "edition": {"title": "Moč superblokov"}, "fingerprint": "test", "url": "https://example.com/release", "assets": [asset]}
            metadata = json.dumps(release).encode()
            (root / "audio/release.json").write_bytes(metadata)
            remote = {"draft": False, "prerelease": False, "body": "Audio inventory SHA-256: test", "assets": [
                {"name": asset["releaseAsset"], "size": asset["bytes"], "digest": "sha256:" + asset["sha256"]},
                {"name": AUDIO.METADATA, "size": len(metadata), "digest": "sha256:" + hashlib.sha256(metadata).hexdigest()}]}

            def publish(**kwargs):
                with kwargs["stage"]() as attachments:
                    self.assertEqual(len(attachments), 2)
                    self.assertEqual(next(Path(p) for p in attachments if p.endswith(".mp3")).read_bytes(), source.read_bytes())
                return True

            with patch.object(AUDIO, "ROOT", root), patch.object(AUDIO, "checked", return_value="valid"), \
                 patch.object(AUDIO, "require_committed", return_value="commit"), patch.object(AUDIO, "find_release", return_value=remote), \
                 patch.object(AUDIO, "range_check"), patch.object(AUDIO, "publish_release", side_effect=publish) as upload:
                AUDIO.run(publish=True)
                upload.assert_called_once()
            self.assertFalse((root / ".cache").exists())


if __name__ == "__main__":
    unittest.main()
