const res = await fetch("https://wandbox.org/api/compile.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        compiler: "nodejs-head",
        code: "console.log('Hello from Wandbox');",
        save: false
    })
});
const data = await res.json();
console.log(data);
