export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: 0 }}>DemoInbox Data Layer</h1>
      <p style={{ marginTop: 8 }}>
        Collector: <code>/collect</code> • Client: <code>/dl.js</code> • Health:{" "}
        <code>/health</code>
      </p>

      <h2>Quick test</h2>
      <ol>
        <li>
          Open DevTools Console on any site and run:
          <pre style={{ background: "#f5f5f5", padding: 12, overflowX: "auto" }}>
{`(async () => {
  const res = await fetch("https://demoinbox.com/collect?debug=1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dl-site": "site_a",
      "x-dl-key": "demo-site-a-key"
    },
    body: JSON.stringify({
      event: "debug_test",
      ts: Date.now(),
      page: { url: location.href, path: location.pathname, referrer: document.referrer, title: document.title, utm: {} },
      props: { hello: "world" },
      consent: { analytics: true }
    })
  });
  console.log(await res.json());
})();`}
          </pre>
        </li>
      </ol>
    </main>
  );
}
