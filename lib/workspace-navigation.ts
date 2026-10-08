export const workspaceSections = [
  { id:"overview", number:"01", href:"#overview", label:"Overview", description:"What needs attention and where things stand." },
  { id:"orders", number:"02", href:"#order-queue", label:"Orders", description:"Review pending orders, printed-stock allocations, and shipping holds." },
  { id:"inventory", number:"03", href:"#inventory", label:"Inventory", description:"Printed mats, blank stock, packaging, and available capacity." },
  { id:"production", number:"04", href:"#production-runs", label:"Production Runs", description:"Plan each batch and reconcile what was actually printed." },
  { id:"financial", number:"05", href:"#operations", label:"Payments & deliveries", description:"Track the account balance, payment history, and incoming supplies." },
  { id:"defects", number:"06", href:"#defective-mats", label:"Defects & credits", description:"Document damaged mats and trace their prepayment credits." },
  { id:"sales", number:"07", href:"#mat-sales", label:"Sales insights", description:"Design demand and order trends from the loaded order history." },
  { id:"team", number:"08", href:"#portal-users", label:"Team & access", description:"Portal users, recent access, and account management." },
] as const;
export type WorkspaceSection = typeof workspaceSections[number]["id"];
export function workspaceSectionForHash(hash:string):WorkspaceSection {
  const id=hash.replace(/^#/,"");
  if(["pipeline","order-queue"].includes(id))return "orders";
  if(["inventory","supplies","printed-mats"].includes(id))return "inventory";
  if(["production-runs","production-plan","next-production-run"].includes(id))return "production";
  if(["operations","payment-entry"].includes(id))return "financial";
  if(id==="defective-mats")return "defects";
  if(id==="mat-sales")return "sales";
  if(["portal-users","portal-access"].includes(id))return "team";
  return "overview";
}
