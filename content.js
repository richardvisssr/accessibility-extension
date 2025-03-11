import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI;
let model;

// Initialize the API
chrome.storage.sync.get('geminiApiKey', (data) => {
  if (!data.geminiApiKey) {
    console.error('Gemini API key not set. Please set it in extension options.');
    return;
  }

  genAI = new GoogleGenerativeAI(data.geminiApiKey);
  model = genAI.getGenerativeModel({
    model: "gemini-2.0-pro-exp-02-05",
  });
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function generateAltText(imageUrl, axeViolation) {
  if (!imageUrl || !axeViolation) {
    console.error('Missing required parameters');
    return '';
  }

  try {
    // 1. Pre-analyze the help documentation
    const helpPrompt = `Summarize the key requirements and best practices for fixing the axe-core violation at this URL: ${axeViolation.helpUrl}. Focus on brevity, conciseness, and the distinction between decorative and informative images.`;

    const helpAnalysis = await getHelpAnalysis(axeViolation.helpUrl, helpPrompt);

    // 2. Image analysis and alt text generation
    const prompt = `You are an accessibility expert (WCAG 2.1, 2.2). You've already analyzed axe-core rule: ${axeViolation.helpUrl}.

Based on this pre-analysis (key points: ${helpAnalysis}), and considering the following violation details:

- Type: ${axeViolation.id}
- Impact: ${axeViolation.impact}
- Context (HTML): ${axeViolation.html}

Generate ONLY the alt text (no explanations, no quotes, just the text) for the image. Be concise (under 125 characters if possible), and prioritize the image's *purpose* within the context. If decorative, output an empty string (""). If informative, be brief but accurate. If it's an image inside a link, describe the link's *destination*.`;

    // Create image part from URL
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();

    const chatSession = await model.startChat({ generationConfig });
    const result = await chatSession.sendMessage([
      prompt,
      {
        inlineData: {
          mimeType: imageBlob.type,
          data: await blobToBase64(imageBlob)
        }
      }
    ]);

    if (!result || !result.response) {
      throw new Error('Invalid response from AI model');
    }

    const altText = result.response.text().trim();
    console.log(`Generated alt text for ${imageUrl}:`, altText);
    return altText;
  } catch (error) {
    console.error('Error generating alt text:', error);
    return '';
  }
}

// Helper function to convert Blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper function for caching help analysis
const helpAnalysisCache = new Map();

async function getHelpAnalysis(helpUrl, helpPrompt) {
  if (!helpUrl || !helpPrompt) {
    console.error('Missing required parameters for help analysis');
    return '';
  }

  try {
    if (helpAnalysisCache.has(helpUrl)) {
      return helpAnalysisCache.get(helpUrl);
    }

    const helpSession = await model.startChat({ generationConfig });
    const helpResponse = await helpSession.sendMessage(helpPrompt);

    if (!helpResponse || !helpResponse.response) {
      throw new Error('Invalid help response from AI model');
    }

    const analysis = helpResponse.response.text();
    helpAnalysisCache.set(helpUrl, analysis);
    return analysis;
  } catch (error) {
    console.error('Error analyzing help documentation:', error);
    return '';
  }
}

window.addEventListener('load', async () => {
  try {
    const results = await new Promise((resolve, reject) => {
      axe.run({
        runOnly: {
          type: 'rule',
          values: ['image-alt']
        }, 
        resultTypes: ['violations', 'incomplete', 'inapplicable'],
      },
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
    });

    if (!results) {
      throw new Error('Invalid results from axe analysis');
    }

    // Log all result types for analysis
    console.log('Violations found:', results.violations);
    console.log('Incomplete checks:', results.incomplete);
    console.log('Inapplicable rules:', results.inapplicable);

    // Handle violations as before
    for (const violation of results.violations) {
      if (violation.id === 'image-alt') {
        for (const node of violation.nodes) {
          for (const target of node.target) {
            const img = document.querySelector(target);
            if (img && (!img.alt || img.alt.trim() === '')) {
              console.log('Processing image:', img);
              const altText = await generateAltText(img.src, {
                id: violation.id,
                description: violation.description,
                helpUrl: violation.helpUrl,
                impact: violation.impact,
                html: node.html,
                target: target
              });

              if (altText) {
                img.alt = altText;
              }
            }
          }
        }
      }
    }

    // Handle incomplete results that might need human review
    if (results.incomplete) {
      for (const incomplete of results.incomplete) {
        if (incomplete.id === 'image-alt') {
          console.log('Images needing human review:', incomplete.nodes);
          for (const node of incomplete.nodes) {
            // Log details for manual review
            console.log({
              element: node.html,
              impact: incomplete.impact,
              reason: incomplete.description,
              help: incomplete.helpUrl
            });
          }
        }
      }
    }

    // Log inapplicable rules for documentation
    if (results.inapplicable) {
      console.log('Rules not applicable to current page:',
        results.inapplicable.map(rule => ({
          id: rule.id,
          description: rule.description
        }))
      );
    }

  } catch (error) {
    console.error('Error running accessibility analysis:', error);
  }
});