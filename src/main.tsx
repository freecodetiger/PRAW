import ReactDOM from "react-dom/client";
import { loadBundledTerminalFonts } from "./app/bundled-fonts";
import App from "./app/App";
import "./app/styles.css";

async function bootstrap() {
  await loadBundledTerminalFonts();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
}

void bootstrap();
