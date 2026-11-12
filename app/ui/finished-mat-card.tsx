import { AlertTriangle } from "lucide-react";

export type FinishedMatStock = {
  design_key: string;
  design_name: string;
  quantity: number;
  committed: number;
  available: number;
};

export default function FinishedMatCard({ mat, stockChecked }: {
  mat: FinishedMatStock;
  stockChecked: boolean;
}) {
  const low = stockChecked && mat.available <= 5;
  return <article className={`finished-mat-card${low ? " low-supply" : ""}`} aria-label={`${mat.design_name} printed stock`}>
    {low && <span className="card-warning" title="Low printed stock" aria-label="Low printed stock">
      <AlertTriangle size={17} aria-hidden="true" />
    </span>}
    <div className="finished-mat-title">
      <span>READY STOCK</span>
      <h3>{mat.design_name}</h3>
    </div>
    <strong>{mat.quantity}</strong>
    <div className="allocation">
      <div><span>Committed</span><b>{mat.committed}</b></div>
      <div><span>Available</span><b>{mat.available}</b></div>
    </div>
    {low && <p className="printed-mat-warning">Low stock · {mat.available} available</p>}
  </article>;
}

export function PrintedMatLowStock({ mats, stockChecked }: {
  mats: FinishedMatStock[];
  stockChecked: boolean;
}) {
  const lowMats = stockChecked ? mats.filter(mat => mat.available <= 5) : [];
  if (!lowMats.length) return null;
  return <section className="printed-mat-low-stock" aria-labelledby="printed-mat-low-stock-title">
    <div className="dashboard-section-heading">
      <div><span className="section-icon"><AlertTriangle size={18} aria-hidden="true" /></span><h2 id="printed-mat-low-stock-title">Printed mats running low</h2></div>
      <a href="#printed-mats">View printed inventory</a>
    </div>
    <p>5 or fewer available after pending-order commitments.</p>
    <div className="finished-mats-grid">
      {lowMats.map(mat => <FinishedMatCard key={mat.design_key} mat={mat} stockChecked={stockChecked} />)}
    </div>
  </section>;
}
