/**
 * RawTextModal.tsx — Diagnostic view showing exact text extracted by PyMuPDF
 * and date detection candidates for developers and clinicians.
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import {
  reportsApi,
  type Report,
  type ReportExtractionResponse,
} from '../../lib/apiClient';

interface RawTextModalProps {
  isOpen: boolean;
  report: Report;
  onClose: () => void;
}

export const RawTextModal: React.FC<RawTextModalProps> = ({
  isOpen,
  report,
  onClose,
}) => {
  const [data, setData] = useState<ReportExtractionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setCopied(false);

    reportsApi
      .getExtraction(report.id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load extraction details.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, report.id]);

  const handleCopy = async () => {
    if (!data?.extracted_text) return;
    try {
      await navigator.clipboard.writeText(data.extracted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Extracted Text & Date Inspection"
      description={`Raw extraction diagnostics for "${report.original_filename}"`}
      maxWidth="780px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 0' }}>
            <Skeleton width="100%" height="32px" />
            <Skeleton width="100%" height="80px" />
            <Skeleton width="100%" height="200px" />
          </div>
        ) : error ? (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--danger-soft)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-input)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        ) : data ? (
          <>
            {/* Status summary badges */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '10px 14px',
                backgroundColor: 'var(--background)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--border)',
              }}
            >
              <Badge variant={data.has_text_layer ? 'confirmed' : 'danger'}>
                {data.has_text_layer ? '✓ Text Layer Available' : '⚠️ Scanned / Image Only'}
              </Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {data.page_count} page{data.page_count !== 1 ? 's' : ''} • {data.char_count_total} characters
              </span>
              {data.detected_date && (
                <span style={{ fontSize: '12px', color: 'var(--text)', marginLeft: 'auto', fontWeight: 600 }}>
                  Date: {data.detected_date} {data.is_date_ambiguous ? '(Ambiguous)' : ''}
                </span>
              )}
            </div>

            {/* If scanned / failure reason */}
            {data.is_scanned && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--warning-soft)',
                  color: 'var(--warning)',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '13px',
                  lineHeight: '1.4',
                }}
              >
                <strong>Scanned PDF Detected:</strong> {data.failure_reason || 'Insufficient readable text in PDF.'}
              </div>
            )}

            {/* Date Candidates */}
            {data.date_alternatives && data.date_alternatives.length > 0 && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text)' }}>
                  Detected Date Candidates ({data.date_alternatives.length}):
                </h4>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                    fontSize: '12px',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--background)', color: 'var(--text-muted)' }}>
                      <tr>
                        <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>Date</th>
                        <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>Type</th>
                        <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>Confidence</th>
                        <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>Context Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.date_alternatives.map((cand, idx) => (
                        <tr key={idx} style={{ borderBottom: idx < data.date_alternatives.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--primary)' }}>
                            {cand.date_iso}
                          </td>
                          <td style={{ padding: '6px 10px', textTransform: 'capitalize' }}>
                            {cand.label_type}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <Badge variant={cand.confidence === 'high' ? 'confirmed' : 'warning'}>
                              {cand.confidence}
                            </Badge>
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {cand.source_text}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Raw Text Output */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  Raw Extracted Text:
                </h4>
                <Button variant="secondary" size="sm" onClick={() => void handleCopy()} style={{ fontSize: '12px' }}>
                  {copied ? '✓ Copied' : 'Copy Text'}
                </Button>
              </div>
              <pre
                style={{
                  backgroundColor: 'var(--background)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  margin: 0,
                }}
              >
                {data.extracted_text || '(No text extracted from this document)'}
              </pre>
            </div>
          </>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
