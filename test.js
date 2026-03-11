fetch("http://localhost:3000/api/documents/cmmm186dv0000urcgloaprjxe/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "hello" })
}).then(async r => console.log(r.status, await r.json())).catch(console.error);
