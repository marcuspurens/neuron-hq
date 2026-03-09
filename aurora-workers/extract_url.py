"""Extract main text content from a URL using trafilatura."""
import trafilatura


def extract_url(url: str) -> dict:
    """Extract main text content from a web page.

    Args:
        url: The URL to fetch and extract text from.

    Returns:
        Dict with title, text, and metadata keys.

    Raises:
        ValueError: If the URL could not be fetched or text could not be extracted.
    """
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Could not fetch URL: {url}")

    text = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
    )
    if not text:
        raise ValueError(f"Could not extract text from URL: {url}")

    metadata = trafilatura.extract_metadata(downloaded)
    title = metadata.title if metadata and metadata.title else url
    language = metadata.language if metadata and metadata.language else "unknown"

    words = text.split()
    return {
        "title": title,
        "text": text,
        "metadata": {
            "source_type": "url",
            "word_count": len(words),
            "language": language,
        },
    }
