// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        <Script
          id="demoinbox-dl"
          src="https://hdl.contentstackapps.com/dl.js"
          strategy="afterInteractive"
        />

        <Script
          id="demoinbox-dl-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  function initWhenReady() {
    if (!window.dl) return false;

    // prevent accidental double init
    if (window.__dl_inited) return true;
    window.__dl_inited = true;

    window.dl.init({
      endpoint: "https://hdl.contentstackapps.com/collect?debug=1",
      hdlEndpoint: "https://hdl.contentstackapps.com/api/hdl",
      siteId: "contentstack_site_a",
      writeKey: "cs-demo-a-123",
      base: { consent: { analytics: true } }
    });

    window.dl.auto(); // enrich + page_view

    console.log("[DL] initialised with URL-driven HDL");
    return true;
  }

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (initWhenReady() || tries > 100) clearInterval(t);
  }, 50);
})();
            `,
          }}
        />
      </body>
    </html>
  );
}
