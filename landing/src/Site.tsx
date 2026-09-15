import App from "./App";
import { GuideIndex, GuidePage } from "./components/Guides";
import { guideForPath } from "./lib/guides";

export default function Site({ path }: { path: string }) {
  if (path === "/guides/" || path === "/guides") return <GuideIndex />;
  const guide = guideForPath(path);
  return guide ? <GuidePage guide={guide} /> : <App />;
}
