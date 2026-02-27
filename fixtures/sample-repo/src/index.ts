import { add } from "./math";
import { loadConfig } from "./config";

const config = loadConfig();
console.log(add(config.base, 2));
