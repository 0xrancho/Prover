import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Embed a single text string
export async function embedText(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });

  return response.data[0].embedding;
}

// Embed multiple texts in batch (more efficient for bulk operations)
export async function embedTexts(texts) {
  if (texts.length === 0) return [];

  // OpenAI allows up to 2048 inputs per request, but we'll batch at 100 for safety
  const batchSize = 100;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: batch,
    });

    const embeddings = response.data.map(d => d.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// Embed chunks and attach embeddings to each chunk object
export async function embedChunks(chunks) {
  const texts = chunks.map(c => c.content);
  const embeddings = await embedTexts(texts);

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));
}
