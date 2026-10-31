"""Figure video URL recognition. Contract fixtures are shared with the website."""
import re
from urllib.parse import parse_qs, urljoin, urlsplit

from handbook.config import load_config


def figure_video_url(src: str) -> str | None:
    raw = src.strip()
    try:
        url = urlsplit(urljoin("https://figure.invalid/", raw))
        host = (url.hostname or "").lower()
    except ValueError:
        return None
    if url.scheme not in {"http", "https"}:
        return None
    parts = [part for part in url.path.split("/") if part]
    provider, identifier = None, None
    if host == "youtu.be":
        provider, identifier = "youtube", next(iter(parts), None)
    elif host in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"}:
        provider = "youtube"
        if parts and parts[0] == "watch":
            identifier = parse_qs(url.query, keep_blank_values=True).get("v", [None])[0]
        elif len(parts) > 1 and parts[0] in {"embed", "shorts"}:
            identifier = parts[1]
    elif host in {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}:
        provider = "vimeo"
        identifier = (parts[1] if len(parts) > 1 else None) if parts and parts[0] == "video" else next(iter(parts), None)
    if provider and identifier and re.fullmatch(r"[\w-]+" if provider == "youtube" else r"\d+", identifier, flags=re.ASCII):
        return f"https://www.youtube.com/watch?v={identifier}" if provider == "youtube" else f"https://vimeo.com/{identifier}"
    if re.search(r"\.(mp4|webm|mov|ogg)$", url.path, flags=re.I):
        return raw
    return None


def figure_video_export_url(src: str) -> str | None:
    """Link to hosted media, never a path inside the PDF/EPUB package.

    Relative filenames use the public site base; root-relative URLs retain
    their browser meaning. Provider recognition remains shared with the web.
    """
    video = figure_video_url(src)
    if video is None:
        return None
    if urlsplit(video).scheme in {"http", "https"}:
        return video
    config = load_config()
    public_base = urljoin(config["site"].rstrip("/") + "/", config["base"].strip("/") + "/")
    return urljoin(public_base, video)
