import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';

export interface DashboardPageProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onNavigateTo: (route: string) => void;
  onRetryConnection: () => void;
  errorDetails: string | null;
}

interface PatientRecord {
  id: string;
  name: string;
  latestDate: string;
  reportCount: number;
  status: 'reviewed' | 'needs_review' | 'processing';
  statusLabel: string;
}

interface AnalyteTrend {
  name: string;
  category: string;
  currentValue: string;
  unit: string;
  referenceRange: string;
  status: 'normal' | 'optimal' | 'improving' | 'high';
  statusLabel: string;
  points: { date: string; value: number }[];
  min: number;
  max: number;
}

interface ActivityItem {
  id: string;
  time: string;
  action: string;
  detail: string;
  icon: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  connectionStatus,
  onNavigateTo,
  onRetryConnection,
  errorDetails,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Sample patient data for the dashboard preview
  const patients: PatientRecord[] = [
    {
      id: 'PT-1042',
      name: 'Sarah Jenkins',
      latestDate: '18 Oct 2026',
      reportCount: 4,
      status: 'needs_review',
      statusLabel: 'Ready for review',
    },
    {
      id: 'PT-1039',
      name: 'Robert Chen',
      latestDate: '14 Oct 2026',
      reportCount: 6,
      status: 'reviewed',
      statusLabel: 'Reviewed',
    },
    {
      id: 'PT-0982',
      name: 'Maria Garcia',
      latestDate: '02 Sep 2026',
      reportCount: 2,
      status: 'reviewed',
      statusLabel: 'Reviewed',
    },
    {
      id: 'PT-0975',
      name: 'David Kim',
      latestDate: '15 Aug 2026',
      reportCount: 5,
      status: 'processing',
      statusLabel: 'Processing',
    },
  ];

  // Sample analyte trend metrics
  const analyteTrends: AnalyteTrend[] = [
    {
      name: 'Hemoglobin',
      category: 'Complete Blood Count',
      currentValue: '14.2',
      unit: 'g/dL',
      referenceRange: '13.0 - 17.0',
      status: 'normal',
      statusLabel: 'Normal',
      points: [
        { date: 'Jan 26', value: 13.8 },
        { date: 'May 26', value: 14.1 },
        { date: 'Oct 26', value: 14.2 },
      ],
      min: 12.0,
      max: 18.0,
    },
    {
      name: 'Serum Creatinine',
      category: 'Kidney Function',
      currentValue: '0.90',
      unit: 'mg/dL',
      referenceRange: '0.70 - 1.30',
      status: 'optimal',
      statusLabel: 'Optimal',
      points: [
        { date: 'Jan 26', value: 1.1 },
        { date: 'May 26', value: 1.0 },
        { date: 'Oct 26', value: 0.9 },
      ],
      min: 0.5,
      max: 1.5,
    },
    {
      name: 'Total Cholesterol',
      category: 'Lipid Panel',
      currentValue: '188',
      unit: 'mg/dL',
      referenceRange: '< 200',
      status: 'improving',
      statusLabel: 'Improving',
      points: [
        { date: 'Jan 26', value: 235 },
        { date: 'May 26', value: 195 },
        { date: 'Oct 26', value: 188 },
      ],
      min: 150,
      max: 250,
    },
  ];

  // Recent system activity
  const activities: ActivityItem[] = [
    {
      id: '1',
      time: '12m ago',
      action: 'Report parsed',
      detail: 'Blood Chemistry Panel uploaded for Robert Chen (6 pages)',
      icon: '📄',
    },
    {
      id: '2',
      time: '45m ago',
      action: 'Values confirmed',
      detail: 'Sarah Jenkins: 14 CBC test rows verified and locked',
      icon: '✓',
    },
    {
      id: '3',
      time: '2h ago',
      action: 'Flag detected',
      detail: 'Lipid report flagged Total Cholesterol outside normal range (235 H)',
      icon: '⚠️',
    },
    {
      id: '4',
      time: '1d ago',
      action: 'Workspace created',
      detail: 'Patient workspace PT-1042 initialized',
      icon: '👥',
    },
  ];

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Dashboard Header per specification */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Medical Dashboard
          </h1>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
              marginTop: '4px',
              marginBottom: 0,
            }}
          >
            Turn scattered lab reports into one clear patient timeline.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={() => onNavigateTo('upload')}
            leftIcon={<span style={{ fontSize: '15px' }}>📤</span>}
          >
            Upload Reports
          </Button>
          <Button
            variant="primary"
            onClick={() => onNavigateTo('patients')}
            leftIcon={<span style={{ fontSize: '15px' }}>+</span>}
          >
            New Patient
          </Button>
        </div>
      </div>

      {/* Backend Health Check Diagnostics Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-input)',
          boxShadow: 'var(--shadow-card)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Badge
            variant={
              connectionStatus === 'connected'
                ? 'confirmed'
                : connectionStatus === 'disconnected'
                  ? 'danger'
                  : 'warning'
            }
            dot
          >
            {connectionStatus === 'connected' && 'Backend connected'}
            {connectionStatus === 'disconnected' && 'Disconnected'}
            {connectionStatus === 'connecting' && 'Connecting...'}
          </Badge>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Service: <code>http://127.0.0.1:8000/api/v1/health</code>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {errorDetails && (
            <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{errorDetails}</span>
          )}
          <Button variant="ghost" size="sm" onClick={onRetryConnection}>
            Re-check Health
          </Button>
        </div>
      </div>

      {/* Four Metric Cards per specification */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Metric 1: Total Patients */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  Total Patients
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    marginTop: '4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  12
                </div>
              </div>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                👥
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="confirmed" style={{ fontSize: '11px', padding: '1px 6px' }}>
                +2 this month
              </Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Active workspaces</span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Reports Processed */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  Reports Processed
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    marginTop: '4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  48
                </div>
              </div>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(21, 128, 61, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                📄
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="confirmed" style={{ fontSize: '11px', padding: '1px 6px' }}>
                100% text-parsed
              </Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Text layers verified</span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Tests Extracted */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  Tests Extracted
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    marginTop: '4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  384
                </div>
              </div>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(29, 78, 216, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                🧪
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="info" style={{ fontSize: '11px', padding: '1px 6px' }}>
                Canonical mapped
              </Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Zero guessed values</span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Pending Reviews */}
        <Card>
          <CardContent style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  Pending Reviews
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    marginTop: '4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  3
                </div>
              </div>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(180, 83, 9, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                ⏳
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="warning" dot style={{ fontSize: '11px', padding: '1px 6px' }}>
                Needs attention
              </Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Human review gate</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Recent Timelines & Analyte Trend Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Recent Patient Timelines Table */}
          <Card>
            <CardHeader
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <CardTitle>Recent Patient Timelines</CardTitle>
                <CardDescription>
                  Workspaces with recently uploaded laboratory panels and reviews.
                </CardDescription>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Filter patients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                    width: '150px',
                  }}
                />
                <Button variant="ghost" size="sm" onClick={() => onNavigateTo('patients')}>
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent style={{ padding: '0 0 8px 0' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Latest Report</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {patient.id}
                      </TableCell>
                      <TableCell style={{ fontWeight: 500 }}>{patient.name}</TableCell>
                      <TableCell>{patient.latestDate}</TableCell>
                      <TableCell>{patient.reportCount} reports</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            patient.status === 'reviewed'
                              ? 'confirmed'
                              : patient.status === 'needs_review'
                                ? 'warning'
                                : 'info'
                          }
                          dot={patient.status === 'needs_review'}
                        >
                          {patient.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onNavigateTo('timeline')}
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          Open Timeline →
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Compact Analyte Trend Preview per specification */}
          <Card>
            <CardHeader
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <CardTitle>Analyte Trends Preview</CardTitle>
                <CardDescription>
                  Tracking key chronological parameters across reports (Sample: Sarah Jenkins • PT-1042)
                </CardDescription>
              </div>
              <Badge variant="neutral">3 Serial Reports</Badge>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {analyteTrends.map((trend) => (
                  <div
                    key={trend.name}
                    style={{
                      padding: '14px 16px',
                      backgroundColor: 'var(--surface-muted)',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                          {trend.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {trend.category} • Ref: {trend.referenceRange} {trend.unit}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                          {trend.currentValue}{' '}
                          <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>
                            {trend.unit}
                          </span>
                        </div>
                        <Badge
                          variant={
                            trend.status === 'normal' || trend.status === 'optimal'
                              ? 'confirmed'
                              : 'edited'
                          }
                          style={{ fontSize: '10px', padding: '1px 6px' }}
                        >
                          {trend.statusLabel}
                        </Badge>
                      </div>
                    </div>

                    {/* Compact visual trend steps */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          width: '45px',
                        }}
                      >
                        History:
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flex: 1, alignItems: 'center' }}>
                        {trend.points.map((pt, i) => (
                          <div
                            key={pt.date}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                            }}
                          >
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                              {pt.date}:
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                              {pt.value}
                            </span>
                            {i < trend.points.length - 1 && (
                              <span style={{ color: 'var(--border)', margin: '0 4px' }}>→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Values extracted deterministically from original lab tables.
              </span>
              <Button variant="ghost" size="sm" onClick={() => onNavigateTo('timeline')}>
                Explore Full Matrix →
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Column: Quick Upload & Recent Activity Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Quick Upload Action Card */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Lab Reports</CardTitle>
              <CardDescription>
                Add new PDF records to extract test rows and expand the timeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={() => onNavigateTo('upload')}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius-input)',
                  padding: '28px 16px',
                  textAlign: 'center',
                  backgroundColor: 'var(--surface-muted)',
                  cursor: 'pointer',
                  transition: 'border-color 150ms ease-out',
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📑</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  Drop lab report PDFs here
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Text-based PDFs up to 20 MB
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: '14px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateTo('upload');
                  }}
                >
                  Browse PDF Files
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Audit log of local report processing and reviews.</CardDescription>
            </CardHeader>
            <CardContent style={{ padding: '8px 24px 20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activities.map((act) => (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      fontSize: '13px',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        flexShrink: 0,
                      }}
                    >
                      {act.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{act.action}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {act.time}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                          lineHeight: 1.4,
                        }}
                      >
                        {act.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Guiding Principles Card */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>
              🛡️ MedTimeline AI Principles
            </div>
            <div>
              <strong>Trust over cleverness:</strong> A blank cell is always better than a wrong
              number. Nothing is guessed or silently altered.
            </div>
            <div>
              <strong>Human in the loop:</strong> Extracted data remains a draft until verified by you.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
