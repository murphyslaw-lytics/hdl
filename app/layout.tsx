// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* 1) Load your hosted data layer client from demoinbox.com */}
        <Script
          id="demoinbox-dl"
          src="https://hdl.contentstackapps.com/dl.js"
          strategy="afterInteractive"
        />

        {/* 2) Initialise it once it’s available */}
        <Script
          id="demoinbox-dl-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  function initWhenReady() {
    if (!window.dl) return false;

    window.dl.init({
      endpoint: "https://hdl.contentstackapps.com/collect?debug=1",
      siteId: "https://30rpr-lego-poc.contentstackapps.com",
      writeKey: "cs-demo-a-123",
      base: { consent: { analytics: true } }
    });

    // Optional: fire one test event so you can see it in Network immediately
    window.dl.track("page_view", { auto: true });

    console.log("[DL] initialised on site_a");
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
