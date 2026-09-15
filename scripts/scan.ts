import { scanMachine } from "../electron/collectors";
const scan = await scanMachine();
console.log(JSON.stringify(scan, null, 2));
