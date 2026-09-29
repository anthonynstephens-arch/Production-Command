"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileImage, Palette, RefreshCw } from "lucide-react";

import type { PortalOrder } from "@/lib/shipstation";

type DesignDetail = {
  publicId: string;
  productTitle: string;
  garmentColor: string;
  printDimensions: Record<string, { widthIn?: number; heightIn?: number }>;
  proofImages: Record<string, string>;
  artworkFiles: string[];
  placementArtwork: Record<string, string[]>;
  status: string;
  orderName: string;
  quantity: number | null;
  orderedAt: string | null;
};

type Submission = {
  key: string;
  designId: string;
  orderNumber: string;
  customer: string;
  orderDate: string;
  fulfillmentStatus: PortalOrder["status"];
  quantity: number;
  products: string[];
};

function optionValue(
  item: NonNullable<PortalOrder["items"]>[number],
  name: string,
) {
  return item.options?.find(
    option => option.name.trim().toLowerCase() === name.toLowerCase(),
  )?.value?.trim();
}

function designIdFor(item: NonNullable<PortalOrder["items"]>[number]) {
  return optionValue(item, "Design ID") || optionValue(item, "Design Record") || "";
}

function isDecorationFee(item: NonNullable<PortalOrder["items"]>[number]) {
  return Boolean(optionValue(item, "Decoration Fee")) || /imprint location fee/i.test(item.name);
}

function prettyPlacement(value: string) {
  return value
    .replace("rightSleeve", "Right sleeve")
    .replace("leftSleeve", "Left sleeve")
    .replace(/^front$/, "Front")
    .replace(/^back$/, "Back");
}

function prettyStatus(value: string) {
  const labels: Record<string, string> = {
    ordered: "Ordered",
    art_review: "Art Review",
    production_ready: "Production Ready",
    in_production: "In Production",
    complete: "Complete",
  };
  return labels[value] || value.replaceAll("_", " ");
}

export default function DesignStudioSubmissions({ orders }: { orders: PortalOrder[] }) {
  const [details, setDetails] = useState<Record<string, DesignDetail | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const submissions = useMemo(() => {
    const grouped = new Map<string, Submission>();

    for (const order of orders) {
      for (const item of order.items || []) {
        const designId = designIdFor(item);
        if (!/^DD-\d{8}-[A-Z0-9]{8}$/i.test(designId)) continue;

        const key = `${order.orderNumber}::${designId}`;
        const current = grouped.get(key) || {
          key,
          designId,
          orderNumber: order.orderNumber,
          customer: order.customer,
          orderDate: order.orderDate,
          fulfillmentStatus: order.status,
          quantity: 0,
          products: [],
        };

        if (!isDecorationFee(item)) {
          current.quantity += item.quantity;
          if (!current.products.includes(item.name)) current.products.push(item.name);
        }

        grouped.set(key, current);
      }
    }

    return [...grouped.values()].sort(
      (a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
    );
  }, [orders]);

  useEffect(() => {
    let cancelled = false;
    if (!submissions.length) {
      setDetails({});
      setErrors({});
      return;
    }

    setLoading(true);
    Promise.all(
      submissions.map(async submission => {
        const params = new URLSearchParams({
          designId: submission.designId,
          order: submission.orderNumber,
        });
        try {
          const response = await fetch(`/api/design-studio?${params.toString()}`, {
            cache: "no-store",
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load design");
          return { key: submission.key, detail: data.design as DesignDetail, error: "" };
        } catch (error) {
          return {
            key: submission.key,
            detail: null,
            error: error instanceof Error ? error.message : "Could not load design",
          };
        }
      }),
    ).then(results => {
      if (cancelled) return;
      const nextDetails: Record<string, DesignDetail | null> = {};
      const nextErrors: Record<string, string> = {};
      for (const result of results) {
        nextDetails[result.key] = result.detail;
        if (result.error) nextErrors[result.key] = result.error;
      }
      setDetails(nextDetails);
      setErrors(nextErrors);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [submissions, refreshVersion]);

  return (
    <section className="panel design-submissions" id="design-studio-submissions">
      <div className="design-submissions-head">
        <div>
          <p className="eyebrow">DESIGN STUDIO</p>
          <h2>Purchased artwork submissions</h2>
          <p>
            Shopify orders are matched to their Design Studio artwork by Design ID.
          </p>
        </div>
        <div className="design-submissions-actions">
          <span className="design-count">{submissions.length} ordered design{submissions.length === 1 ? "" : "s"}</span>
          <button
            type="button"
            className="sync-button"
            onClick={() => setRefreshVersion(value => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {loading ? "Refreshing…" : "Refresh artwork"}
          </button>
        </div>
      </div>

      {!submissions.length ? (
        <div className="design-submissions-empty">
          <Palette size={30} />
          <strong>No purchased Design Studio artwork in the loaded orders.</strong>
          <span>Orders carrying a Design ID will appear here automatically.</span>
        </div>
      ) : (
        <div className="design-submissions-grid">
          {submissions.map(submission => {
            const detail = details[submission.key];
            const placementNames = Object.keys(detail?.printDimensions || {});
            return (
              <article className="design-submission-card" key={submission.key}>
                <div className="design-submission-top">
                  <div>
                    <div className="design-order-line">
                      <strong>{submission.orderNumber}</strong>
                      <span className={`status ${submission.fulfillmentStatus}`}>
                        <i />
                        {submission.fulfillmentStatus}
                      </span>
                    </div>
                    <h3>{detail?.productTitle || submission.products.join(", ") || "Custom apparel"}</h3>
                    <p>{submission.customer} · Qty {detail?.quantity || submission.quantity || "—"}</p>
                  </div>
                  <span className={`design-workflow-status ${detail?.status || "loading"}`}>
                    {detail ? prettyStatus(detail.status) : loading ? "Loading…" : "Design linked"}
                  </span>
                </div>

                <div className="design-id">{submission.designId}</div>

                {errors[submission.key] ? (
                  <div className="design-load-error">
                    <strong>Artwork lookup needs attention.</strong>
                    <span>{errors[submission.key]}</span>
                  </div>
                ) : null}

                {detail ? (
                  <>
                    <div className="design-placement-grid">
                      {placementNames.map(placement => {
                        const dimensions = detail.printDimensions[placement];
                        const artwork = detail.placementArtwork?.[placement] || [];
                        const preview = detail.proofImages?.[placement] || artwork[0];
                        return (
                          <div className="design-placement" key={placement}>
                            <div className="design-placement-preview">
                              {preview ? (
                                <img src={preview} alt={`${prettyPlacement(placement)} artwork`} />
                              ) : (
                                <FileImage size={28} />
                              )}
                            </div>
                            <div>
                              <strong>{prettyPlacement(placement)}</strong>
                              <span>
                                {dimensions
                                  ? `${Number(dimensions.widthIn || 0).toFixed(2)}″ × ${Number(dimensions.heightIn || 0).toFixed(2)}″`
                                  : "Dimensions unavailable"}
                              </span>
                              {artwork[0] ? (
                                <a href={artwork[0]} target="_blank" rel="noreferrer">
                                  Original art <ExternalLink size={12} />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="design-submission-footer">
                      <span>
                        {detail.garmentColor || "Color unavailable"}
                        {detail.orderedAt ? ` · Ordered ${new Date(detail.orderedAt).toLocaleDateString()}` : ""}
                      </span>
                      <a
                        className="design-manage-link"
                        href={`https://detroit-design-studio.vercel.app/signs/admin/designs?design=${encodeURIComponent(submission.designId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Manage in Design Studio <ExternalLink size={14} />
                      </a>
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
