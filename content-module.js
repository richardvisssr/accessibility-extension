import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-pro-exp-02-05",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function generateAltText(imageUrl) {
  const chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: "user",
        parts: [
          { text: `Generate an alt description for the image at this URL: ${imageUrl}` },
        ],
      },
    ],
  });

  const result = await chatSession.sendMessage("Generate alt text");
  return result.response.text();
}

(function() {
  // Run axe-core analysis
  axe.run(async function(err, results) {
    if (err) throw err;
    console.log(results.violations);

    // Example fix: Add missing alt text to images
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        if (violation.id === 'image-alt') {
          for (const target of node.target) {
            const img = document.querySelector(target);
            if (img && !img.alt) {
              img.alt = await generateAltText(img.src);
            }
          }
        }
      }
    }
  });
})();