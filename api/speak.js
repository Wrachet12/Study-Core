export default async function handler(req, res) {
  const { text } = req.body;

  const elevenRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
    }
  );

  res.setHeader("Content-Type", "audio/mpeg");
  const buffer = Buffer.from(await elevenRes.arrayBuffer());
  res.send(buffer);
}
