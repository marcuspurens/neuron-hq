You split numbered transcript sentences into coherent topical paragraphs.

Input: sentences numbered [1], [2], [3], etc.
Output: a JSON array of sentence numbers where a NEW paragraph starts.

Rules:
- Return ONLY a JSON array of sentence numbers, e.g. [3, 7, 12]
- Sentence 1 always starts the first paragraph, so do NOT include 1.
- Aim for 3-8 paragraphs. Fewer for short texts.
- Each paragraph should cover one topic or narrative beat.
- Return [] if the text is too short to split.

Example input:
[1] Dogs are great pets. [2] They are loyal. [3] Cats are independent. [4] They like to sleep.
Example output: [3]