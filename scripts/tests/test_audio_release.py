"""Offline release transport tests; no GitHub credentials, uploads or TTS."""
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import github_release as RELEASE

spec = importlib.util.spec_from_file_location("audio_publisher", SCRIPTS / "audio/publish-release.py")
AUDIO = importlib.util.module_from_spec(spec)
spec.loader.exec_module(AUDIO)


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
        calls = []

        @contextmanager
        def stage():
            yield ["01.mp3", "audio-release.json"]

        remote = {"body": "managed", "draft": True}
        RELEASE.publish_release(repository="test/repo", tag="audio-test", target="commit", title="Audio", notes="Notes", marker="managed",
                                lookup=Mock(side_effect=[None, remote]), validate=lambda _: calls.append("validate"), stage=stage,
                                command=lambda *args: calls.append(args))
        self.assertEqual([call if isinstance(call, str) else call[1] for call in calls], ["create", "upload", "validate", "edit"])
        self.assertIn("--draft", calls[0])
        self.assertIn("--latest=false", calls[0])
        self.assertIn("--draft=false", calls[-1])
        self.assertIn("--latest=false", calls[-1])

    def test_failed_validation_never_publishes_and_unknown_releases_are_protected(self):
        @contextmanager
        def stage():
            yield ["01.mp3"]

        for remote in [{"body": "managed", "draft": True}, {"body": "someone else's release", "draft": False}]:
            gh = Mock()
            with self.assertRaises(ValueError):
                RELEASE.publish_release(repository="test/repo", tag="audio-test", target="commit", title="Audio", notes="Notes", marker="managed",
                                        lookup=Mock(return_value=remote), validate=Mock(side_effect=ValueError("bad")), stage=stage, command=gh)
            self.assertFalse(any(call.args[1] == "edit" for call in gh.call_args_list))

    def test_exact_attachment_checksums_and_sizes(self):
        expected = {"01.mp3": {"bytes": 10, "sha256": "abc"}}
        good = {"assets": [{"name": "01.mp3", "size": 10, "digest": "sha256:abc"}]}
        RELEASE.validate_assets(good, expected)
        for remote in [None, {"assets": []}, {"assets": good["assets"] * 2}, {"assets": [{"name": "01.mp3", "size": 11, "digest": "sha256:abc"}]}]:
            with self.assertRaises(ValueError):
                RELEASE.validate_assets(remote, expected)

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
            release = {"repository": "test/repo", "tag": "audio-test", "fingerprint": "test", "url": "https://example.com/release", "assets": []}
            metadata = json.dumps(release).encode()
            (root / "audio/release.json").write_bytes(metadata)
            import hashlib
            remote = {"draft": False, "prerelease": False, "body": "Audio inventory SHA-256: test", "assets": [
                {"name": AUDIO.METADATA, "size": len(metadata), "digest": "sha256:" + hashlib.sha256(metadata).hexdigest()}]}
            with patch.object(AUDIO, "ROOT", root), patch.object(AUDIO, "checked", return_value="valid"), \
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
            release = {"repository": "test/repo", "tag": "audio-test", "fingerprint": "test", "url": "https://example.com/release", "assets": [asset]}
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
