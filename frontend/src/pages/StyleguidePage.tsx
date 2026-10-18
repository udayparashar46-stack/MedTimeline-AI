import React, { useState } from 'react';
import { Button, IconButton } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Input, DateInput } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/ui/Drawer';
import { Toast } from '../components/ui/Toast';
import { Tooltip } from '../components/ui/Tooltip';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressRow } from '../components/ui/ProgressRow';
import { FileDropzone } from '../components/ui/FileDropzone';
import { Banner } from '../components/ui/Banner';

export const StyleguidePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('components');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* Intro Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
          Design System & Component Styleguide
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '700px' }}>
          The MedTimeline AI UI kit implements the clinical-but-warm aesthetic defined in Section 4
          and Section 5 of the blueprint. Every component is displayed below in all operational states.
        </p>
      </div>

      {/* Tabs navigation */}
      <Tabs
        tabs={[
          { id: 'components', label: 'Core Components', count: 14 },
          { id: 'tokens', label: 'Color & Typography Tokens' },
          { id: 'table-spec', label: 'Timeline Table States' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'tokens' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Color Tokens (Blueprint Section 5.1)</CardTitle>
              <CardDescription>
                WCAG AA compliant color tokens mapped to CSS variables.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '16px',
                }}
              >
                {[
                  { name: '--primary', val: '#0F766E', label: 'Deep Teal (Primary)' },
                  { name: '--primary-soft', val: '#D8F0ED', label: 'Primary Soft' },
                  { name: '--success', val: '#15803D', label: 'Success (Confirmed)' },
                  { name: '--warning', val: '#B45309', label: 'Warning (Review)' },
                  { name: '--danger', val: '#B42318', label: 'Danger (Errors)' },
                  { name: '--info', val: '#1D4ED8', label: 'Info' },
                  { name: '--text', val: '#0F1B2D', label: 'Primary Text' },
                  { name: '--text-muted', val: '#5B6B7F', label: 'Secondary Text' },
                  { name: '--bg', val: '#F7F8FA', label: 'App Background' },
                  { name: '--surface', val: '#FFFFFF', label: 'Surface Card' },
                  { name: '--border', val: '#E3E7ED', label: 'Dividers / Border' },
                  { name: '--flag-high', val: '#FDE8E6', label: 'High Flag Tint' },
                  { name: '--flag-low', val: '#E6F0FD', label: 'Low Flag Tint' },
                ].map((token) => (
                  <div
                    key={token.name}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-input)',
                      overflow: 'hidden',
                      backgroundColor: 'var(--surface)',
                    }}
                  >
                    <div
                      style={{
                        height: '48px',
                        backgroundColor: `var(${token.name})`,
                        borderBottom: '1px solid var(--border)',
                      }}
                    />
                    <div style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{token.val}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{token.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{token.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'components' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Buttons */}
          <Card>
            <CardHeader>
              <CardTitle>Buttons & IconButtons</CardTitle>
              <CardDescription>Primary, secondary, ghost, danger, and state variants.</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                <Button variant="primary">Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="ghost">Ghost Button</Button>
                <Button variant="danger">Danger Button</Button>
                <Button variant="primary" isLoading>
                  Loading Button
                </Button>
                <Button variant="secondary" disabled>
                  Disabled Button
                </Button>
                <IconButton aria-label="Search reports" variant="secondary">
                  🔍
                </IconButton>
                <IconButton aria-label="Delete report" variant="danger">
                  🗑️
                </IconButton>
              </div>
            </CardContent>
          </Card>

          {/* Badges / Status Pills */}
          <Card>
            <CardHeader>
              <CardTitle>Badges / Status Pills (Section 4 & 5.1)</CardTitle>
              <CardDescription>
                State is always visible via badges, never by color alone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <Badge variant="confirmed" dot>
                  Confirmed
                </Badge>
                <Badge variant="warning" dot>
                  Needs review
                </Badge>
                <Badge variant="danger" dot>
                  Rejected
                </Badge>
                <Badge variant="edited" dot>
                  Edited
                </Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="flag-high">High (H)</Badge>
                <Badge variant="flag-low">Low (L)</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Form Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Inputs & Selects</CardTitle>
              <CardDescription>
                Standard, date input, and select fields with helper and error text.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '20px',
                }}
              >
                <Input
                  label="Patient Identifier / Nickname"
                  placeholder="e.g. Grandma Rose"
                  helperText="Use a nickname to protect patient privacy"
                />
                <DateInput label="Report Collection Date" defaultValue="2026-10-18" />
                <Select
                  label="Canonical Test Mapping"
                  options={[
                    { value: 'hb', label: 'Hemoglobin (CBC)' },
                    { value: 'cr', label: 'Creatinine (Kidney)' },
                    { value: 'wbc', label: 'WBC Count (CBC)' },
                  ]}
                  defaultValue="hb"
                />
                <Input
                  label="Input with Error"
                  defaultValue="Invalid text"
                  error="Format must match lab report standards"
                />
              </div>
            </CardContent>
          </Card>

          {/* Interactive Overlays */}
          <Card>
            <CardHeader>
              <CardTitle>Interactive Modals & Side Drawers</CardTitle>
              <CardDescription>
                Progressive disclosure and confirm dialogs for safe operations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', gap: '16px' }}>
                <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
                  Open Confirm Dialog
                </Button>
                <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
                  Open Details Drawer
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* File Dropzone & Progress Row */}
          <Card>
            <CardHeader>
              <CardTitle>File Upload Dropzone & Progress Tracking</CardTitle>
              <CardDescription>
                Drag-and-drop report uploader and per-file progress row states.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <FileDropzone onFilesSelected={() => {}} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <ProgressRow
                    filename="blood_panel_may2026.pdf"
                    status="reviewed"
                    pageCount={2}
                    extractedCount={24}
                  />
                  <ProgressRow
                    filename="thyroid_test_oct2026.pdf"
                    status="needs_review"
                    pageCount={1}
                    extractedCount={6}
                  />
                  <ProgressRow
                    filename="scanned_report_unreadable.pdf"
                    status="failed"
                    pageCount={1}
                    failureReason="No readable text layer detected (OCR v1.1)"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback & Loaders */}
          <Card>
            <CardHeader>
              <CardTitle>Feedback, Alerts & Skeleton Loaders</CardTitle>
              <CardDescription>
                Banners, toasts, tooltips, and non-distracting skeleton loaders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Banner variant="disclaimer">
                  Generated from user-uploaded reports. Not medical advice. Verify against original
                  reports.
                </Banner>
                <Banner variant="warning">
                  Duplicate file detected: same report hash already uploaded for this patient.
                </Banner>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <Toast message="Row confirmed successfully" variant="success" />
                  <Tooltip content="Source: Page 1, line 14">
                    <Button variant="ghost" size="sm">
                      Hover for PDF Evidence ℹ️
                    </Button>
                  </Tooltip>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Skeleton width="100%" height="20px" />
                  <Skeleton width="75%" height="20px" />
                  <Skeleton width="50%" height="20px" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Empty State */}
          <EmptyState
            icon="📋"
            title="No Lab Reports Yet"
            description="Upload patient PDF lab reports to automatically extract and compare test results across time."
            actionLabel="Upload First Report"
            onAction={() => {}}
          />
        </div>
      )}

      {activeTab === 'table-spec' && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline Table Signature States (Section 4 & 5)</CardTitle>
            <CardDescription>
              Demonstrating filled, blank, unreviewed (dashed underline), edited (dot), and flag
              states with sticky headers and columns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ minWidth: '180px' }}>Test Parameter</TableHead>
                  <TableHead style={{ minWidth: '120px' }}>Unit</TableHead>
                  <TableHead style={{ minWidth: '140px' }}>Reference Range</TableHead>
                  <TableHead style={{ minWidth: '130px' }}>12-Jan-2026</TableHead>
                  <TableHead style={{ minWidth: '130px' }}>15-May-2026</TableHead>
                  <TableHead style={{ minWidth: '130px' }}>18-Oct-2026</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell isStickyColumn style={{ fontWeight: 600 }}>
                    Hemoglobin
                  </TableCell>
                  <TableCell>g/dL</TableCell>
                  <TableCell>13.0 - 17.0</TableCell>
                  <TableCell cellState="default">14.2</TableCell>
                  <TableCell cellState="flag-low">11.8 L</TableCell>
                  <TableCell cellState="edited">13.5</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell isStickyColumn style={{ fontWeight: 600 }}>
                    Serum Creatinine
                  </TableCell>
                  <TableCell>mg/dL</TableCell>
                  <TableCell>0.7 - 1.3</TableCell>
                  <TableCell cellState="default">0.9</TableCell>
                  <TableCell cellState="blank">—</TableCell>
                  <TableCell cellState="unreviewed">1.1</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell isStickyColumn style={{ fontWeight: 600 }}>
                    Total Cholesterol
                  </TableCell>
                  <TableCell>mg/dL</TableCell>
                  <TableCell>&lt; 200</TableCell>
                  <TableCell cellState="flag-high">235 H</TableCell>
                  <TableCell cellState="default">195</TableCell>
                  <TableCell cellState="default">188</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Legend: Dashed underline = unreviewed • Dot = edited value • Red/Blue tints = High/Low flags
            </span>
          </CardFooter>
        </Card>
      )}

      {/* Modal Preview */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Confirm Workspace Deletion"
        description="This action will permanently delete all uploaded PDFs and extracted lab rows for this patient. This cannot be undone."
        confirmLabel="Delete Workspace"
        isDestructive
        onConfirm={() => setIsModalOpen(false)}
      >
        <p style={{ fontSize: '13px', color: 'var(--text)' }}>
          Please type <strong>DELETE</strong> to confirm permanent erasure.
        </p>
      </Modal>

      {/* Drawer Preview */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Result Evidence & History"
        subtitle="Hemoglobin: 14.2 g/dL"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Source PDF</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>blood_panel_may2026.pdf</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Original Extracted Line</div>
            <code
              style={{
                display: 'block',
                padding: '8px',
                backgroundColor: 'var(--surface-muted)',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                marginTop: '4px',
              }}
            >
              Hemoglobin ............. 14.2 g/dL (13.0 - 17.0)
            </code>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Review Status</div>
            <Badge variant="confirmed" dot style={{ marginTop: '4px' }}>
              Confirmed by user
            </Badge>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
