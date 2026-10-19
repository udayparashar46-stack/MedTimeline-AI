/**
 * SettingsPage.tsx — Settings, Privacy Statement, and System Administration (Milestones 11 & 12).
 *
 * Implements blueprint Section 3.1, Section 10.1, Section 15:
 * - Local-Use Privacy Statement and zero-data-leakage architecture.
 * - Prominent Medical Disclaimer.
 * - Explicit documentation of known operational limitations (OCR, unit conversion).
 * - "Delete Everything" cascade with typed confirmation.
 * - System version and environment diagnostics.
 */

import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { systemApi, ResetSummaryResponse } from '../lib/apiClient';

interface SettingsPageProps {
  onNavigateTo?: (route: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigateTo }) => {
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<ResetSummaryResponse | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleOpenResetModal = () => {
    setConfirmText('');
    setResetError(null);
    setIsResetModalOpen(true);
  };

  const handleConfirmReset = async () => {
    if (confirmText !== 'DELETE EVERYTHING') {
      setResetError("Please type 'DELETE EVERYTHING' exactly to confirm.");
      return;
    }

    setIsResetting(true);
    setResetError(null);

    try {
      const summary = await systemApi.reset('DELETE EVERYTHING');
      setResetResult(summary);
      setIsResetModalOpen(false);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'System reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Settings &amp; System Information
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Local privacy architecture, clinical disclaimers, known limitations, and data management.
          </p>
        </div>
        {onNavigateTo && (
          <Button variant="secondary" size="sm" onClick={() => onNavigateTo('dashboard')} aria-label="Return to Dashboard">
            ← Return to Dashboard
          </Button>
        )}
      </div>

      {/* Success Banner after Reset */}
      {resetResult && (
        <div
          role="status"
          style={{
            marginBottom: '24px',
            padding: '16px 20px',
            backgroundColor: 'var(--success-soft)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--radius-card)',
            color: 'var(--success)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>
            ✓ System Reset Completed Successfully
          </div>
          <div style={{ fontSize: '13px' }}>
            {resetResult.message} Purged {resetResult.patients_deleted} workspace(s),{' '}
            {resetResult.reports_deleted} report(s), {resetResult.results_deleted} test result(s), and{' '}
            {resetResult.files_deleted} file(s) from disk. Default canonical tests have been re-seeded.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* 1. Medical Disclaimer Banner */}
        <Card style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--surface)' }}>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  Important Medical Disclaimer
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Blueprint Section 1.6 &amp; Functional Requirement FR6
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text)',
                backgroundColor: 'var(--surface-muted)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-input)',
                margin: 0,
              }}
            >
              "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px', marginBottom: 0 }}>
              MedTimeline AI is an informational organization tool designed to assist patients and families in
              reviewing longitudinal laboratory trends. It does not provide medical diagnoses, treatment advice, or
              clinical assessments. Always consult qualified healthcare providers with original laboratory reports.
            </p>
          </CardContent>
        </Card>

        {/* 2. Privacy & Security Architecture */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🔒</span>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Local-Use Privacy &amp; Security Architecture
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                  127.0.0.1 Localhost Binding
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Backend binds strictly to loopback interface. No medical data or endpoints are reachable over your
                  local network.
                </div>
              </div>

              <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                  Zero External Trackers
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  No Google Analytics, tracking pixels, or third-party CDNs. Fonts and assets are 100% self-hosted
                  locally.
                </div>
              </div>

              <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                  Zero AI/LLM on Patient Data
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Deterministic layout parsing and string extraction only. Your clinical values are never sent to external
                  AI or cloud LLM APIs.
                </div>
              </div>

              <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                  Anonymous UUID Storage
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  All uploaded documents are stored on local disk with random UUID filenames. Original patient names are
                  never exposed on disk paths.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Known Limitations */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>📋</span>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Known Operational Limitations
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.7' }}>
              <li>
                <strong style={{ color: 'var(--text)' }}>Text-Based PDFs Only (No OCR):</strong> Scanned image-only PDFs
                or photographs without digital text layers are detected and flagged. Manual row entry is supported in the
                split-view editor.
              </li>
              <li>
                <strong style={{ color: 'var(--text)' }}>No Automatic Unit Conversion:</strong> Tests with differing units
                across reports (e.g., g/dL vs. g/L) display warning indicators but are never silently converted (Principle
                1: Trust over cleverness).
              </li>
              <li>
                <strong style={{ color: 'var(--text)' }}>Analyte Separation:</strong> Analytes that differ clinically
                (such as Bilirubin Total and Bilirubin Direct) remain permanently separated and are never merged.
              </li>
              <li>
                <strong style={{ color: 'var(--text)' }}>Human Review Safety Gate:</strong> Extracted rows remain in draft
                status until confirmed by the user. Only reviewed results feed the default timeline and exports.
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* 4. System Diagnostics */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚙️</span>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                System Version &amp; Environment
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Software Version:</span>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>v1.0.0-rc1 (Release Candidate)</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Target Architecture:</span>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>FastAPI + React 18 + SQLite</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Database Path:</span>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>data/medtimeline.db</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Extraction Engine:</span>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>PyMuPDF 1.28.2 (Deterministic)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5. Danger Zone: Delete Everything */}
        <Card style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--surface)' }}>
          <CardHeader style={{ borderBottomColor: 'rgba(180, 35, 24, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🗑️</span>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--danger)' }}>
                    Danger Zone: Delete Everything
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Blueprint Section 10.1 Complete Local Storage Reset
                  </span>
                </div>
              </div>
              <Badge variant="danger">Irreversible</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              Permanently delete all patient workspaces, uploaded PDF files, extracted clinical rows, audit trails, and
              custom mappings. This operation will purge local SQLite database tables and physical disk files.
            </p>
            <Button
              variant="danger"
              onClick={handleOpenResetModal}
              aria-label="Permanently Delete Everything"
            >
              Permanently Delete Everything...
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Modal for Delete Everything */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="⚠️ Confirm Complete System Reset"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--flag-high)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--danger)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            WARNING: This action is permanent and cannot be undone. All local workspaces, laboratory PDFs, and
            extracted clinical results will be permanently destroyed.
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>
            To confirm this destructive operation, please type <strong style={{ color: 'var(--danger)' }}>DELETE EVERYTHING</strong> in the box below:
          </p>

          <Input
            placeholder="Type 'DELETE EVERYTHING' to confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            aria-label="Confirm typed reset text"
          />

          {resetError && (
            <div style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 600 }}>
              {resetError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button
              variant="secondary"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmReset}
              disabled={confirmText !== 'DELETE EVERYTHING' || isResetting}
              aria-label="Confirm System Reset"
            >
              {isResetting ? 'Resetting System...' : 'Yes, Permanently Delete Everything'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
