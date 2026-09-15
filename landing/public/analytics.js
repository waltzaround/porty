// Only the public website sends analytics; local previews and the app do not.
if (window.location.hostname === "porty.walt.online") {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", "G-68EK891W8D");
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=G-68EK891W8D";
  document.head.appendChild(tag);
}
