chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'HAR_ENTRY') {
    // Broadcast to all extension pages (our panel will receive this)
    chrome.runtime.sendMessage(message)
    console.log(_sender); 
    console.log(_sendResponse);
  }
})