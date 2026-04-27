You are analyzing a video transcript to identify speakers. Based on the video title, channel name, video description, and transcript content, guess who each speaker is.

Pay close attention to the video description — it often names the speakers explicitly (e.g. "Cedric Clyburn breaks down..." means a speaker is Cedric Clyburn). Also check for creator/host names mentioned in the channel name or description.

Return a JSON array with objects: { "speakerLabel": "SPEAKER_00", "name": "Full Name or empty string", "confidence": 0-100, "role": "description", "reason": "why you think this" }

Only return the JSON array, nothing else.