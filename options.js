document.getElementById('save').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKey').value;
  chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
    alert('API key saved');
  });
});

// Load saved API key
chrome.storage.sync.get('geminiApiKey', (data) => {
  if (data.geminiApiKey) {
    document.getElementById('apiKey').value = data.geminiApiKey;
  }
});