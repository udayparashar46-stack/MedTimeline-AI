import React, { useState, useEffect, useCallback } from 'react';
import {
  patientsApi,
  testsApi,
  mappingApi,
  Patient,
  CanonicalTest,
  UnmatchedTestItem,
  UnitMismatchItem,
} from '../lib/apiClient';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

interface MappingPageProps {
  initialPatientId?: string;
  onNavigateToWorkspace?: (patientId: string) => void;
}

export const MappingPage: React.FC<MappingPageProps> = ({
  initialPatientId,
  onNavigateToWorkspace: _onNavigateToWorkspace,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  // Unmatched tests & Mismatches
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedTestItem[]>([]);
  const [unitMismatches, setUnitMismatches] = useState<UnitMismatchItem[]>([]);
  const [isLoadingMapping, setIsLoadingMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Canonical tests catalog
  const [canonicalTests, setCanonicalTests] = useState<CanonicalTest[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'unmatched' | 'catalog'>('unmatched');

  // Modals
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);
  const [newTestName, setNewTestName] = useState('');
  const [newTestCategory, setNewTestCategory] = useState('');
  const [newTestUnit, setNewTestUnit] = useState('');
  const [modalForRawName, setModalForRawName] = useState<string | null>(null);
  const [manualSelectedTestId, setManualSelectedTestId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load patients
  useEffect(() => {
    let cancelled = false;
    setIsLoadingPatients(true);

    patientsApi
      .list({ limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setPatients(res.items);
          if (!selectedPatientId && res.items.length > 0) {
            setSelectedPatientId(res.items[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingPatients(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  // Load canonical tests catalog
  const loadCanonicalTests = useCallback(async () => {
    try {
      const tests = await testsApi.list();
      setCanonicalTests(tests);
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    void loadCanonicalTests();
  }, [loadCanonicalTests]);

  // Load unmatched tests and unit mismatches for selected patient
  const loadWorkspaceMapping = useCallback(async (patientId: string) => {
    if (!patientId) return;
    setIsLoadingMapping(true);
    setMappingError(null);

    try {
      const [unmatchedRes, mismatchRes] = await Promise.all([
        mappingApi.getUnmatched(patientId),
        mappingApi.getUnitMismatches(patientId),
      ]);
      setUnmatchedItems(unmatchedRes.items);
      setUnitMismatches(mismatchRes.items);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed to load mapping data.');
    } finally {
      setIsLoadingMapping(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      void loadWorkspaceMapping(selectedPatientId);
    }
  }, [selectedPatientId, loadWorkspaceMapping]);

  // Accept a suggestion
  const handleAcceptSuggestion = async (rawTestName: string, testId: string) => {
    if (!selectedPatientId) return;
    setIsSubmitting(true);
    setMappingError(null);

    try {
      const res = await mappingApi.createMapping(selectedPatientId, {
        raw_test_name: rawTestName,
        test_id: testId,
        is_global: false,
      });

      setSuccessMsg(
        `Mapped "${rawTestName}" to canonical test. Updated ${res.updated_results_count} result row(s).`
      );
      setTimeout(() => setSuccessMsg(null), 4000);

      // Refresh list
      void loadWorkspaceMapping(selectedPatientId);
      void loadCanonicalTests();
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed to map test.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create custom canonical test
  const handleCreateCanonicalTest = async () => {
    if (!newTestName.trim()) {
      setMappingError('Test name cannot be blank.');
      return;
    }

    setIsSubmitting(true);
    setMappingError(null);

    try {
      const created = await testsApi.create({
        canonical_name: newTestName.trim(),
        category: newTestCategory.trim() || null,
        preferred_unit: newTestUnit.trim() || null,
      });

      setSuccessMsg(`Created canonical test "${created.canonical_name}".`);
      setTimeout(() => setSuccessMsg(null), 4000);

      setShowCreateTestModal(false);
      setNewTestName('');
      setNewTestCategory('');
      setNewTestUnit('');
      void loadCanonicalTests();

      // If opened from a specific raw test name, automatically map it
      if (modalForRawName && selectedPatientId) {
        await mappingApi.createMapping(selectedPatientId, {
          raw_test_name: modalForRawName,
          test_id: created.id,
          is_global: false,
        });
        setModalForRawName(null);
        void loadWorkspaceMapping(selectedPatientId);
      }
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed to create test.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Map manually to an existing test
  const handleManualMap = async () => {
    if (!modalForRawName || !manualSelectedTestId || !selectedPatientId) return;

    setIsSubmitting(true);
    try {
      await mappingApi.createMapping(selectedPatientId, {
        raw_test_name: modalForRawName,
        test_id: manualSelectedTestId,
        is_global: false,
      });
      setSuccessMsg(`Mapped "${modalForRawName}" successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setModalForRawName(null);
      setManualSelectedTestId('');
      void loadWorkspaceMapping(selectedPatientId);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed to map test.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = Array.from(
    new Set(canonicalTests.map((t) => t.category).filter(Boolean) as string[])
  ).sort();

  const filteredCatalog = canonicalTests.filter((t) => {
    const matchesSearch =
      t.canonical_name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(catalogSearch.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
            Test Normalization &amp; Mapping
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Map report-specific variants (e.g. <em>Hb</em>, <em>Haemoglobin</em>) to single canonical tests for chronological timelines.
          </p>
        </div>

        {/* Patient Workspace Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="patient-select" style={{ fontSize: '13px', fontWeight: 600 }}>
            Patient Workspace:
          </label>
          {isLoadingPatients ? (
            <Skeleton width="180px" height="32px" />
          ) : (
            <select
              id="patient-select"
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: '13px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--text)',
              }}
            >
              {patients.length === 0 && <option value="">No patients available</option>}
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Notifications */}
      {mappingError && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--danger-soft)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-card)',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{mappingError}</span>
          <button
            onClick={() => setMappingError(null)}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--success-soft)',
            color: 'var(--success)',
            borderRadius: 'var(--radius-card)',
            fontSize: '13px',
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Unit Mismatches Warning Banner */}
      {unitMismatches.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--warning-soft)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--warning)', fontSize: '13px' }}>
            <span>⚠️</span>
            <span>Unit Discrepancy Warnings ({unitMismatches.length})</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text)' }}>
            The following tests have conflicting measurement units across different lab reports in this workspace:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            {unitMismatches.map((m) => (
              <div
                key={m.test_id}
                style={{
                  fontSize: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.6)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                }}
              >
                <strong>{m.canonical_name}</strong>: {m.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('unmatched')}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'unmatched' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'unmatched' ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Unmatched Tests ({unmatchedItems.length})
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'catalog' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'catalog' ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Canonical Test Catalog ({canonicalTests.length})
        </button>
      </div>

      {/* TAB 1: UNMATCHED TESTS */}
      {activeTab === 'unmatched' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle style={{ fontSize: '16px' }}>Unresolved Test Names</CardTitle>
                <CardDescription>
                  Tests extracted from PDFs that do not yet match a recognized canonical test. Accepting a match maps all past and future rows.
                </CardDescription>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setShowCreateTestModal(true)}>
                ✚ New Canonical Test
              </Button>
            </div>
          </CardHeader>
          <CardContent style={{ padding: '0 0 8px 0' }}>
            {isLoadingMapping ? (
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton width="100%" height="24px" />
                <Skeleton width="100%" height="24px" />
                <Skeleton width="100%" height="24px" />
              </div>
            ) : unmatchedItems.length === 0 ? (
              <div style={{ padding: '24px' }}>
                <EmptyState
                  icon="✓"
                  title="All extracted tests are resolved!"
                  description="Every test result in this patient workspace maps to a canonical test definition."
                />
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Raw Extracted Test Name</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Occurrences</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Observed Units</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Suggested Canonical Match</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedItems.map((item) => {
                      const topSuggestion = item.suggestions && item.suggestions.length > 0 ? item.suggestions[0] : null;

                      return (
                        <tr key={item.normalized_name || item.raw_test_name} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>
                            <div>{item.raw_test_name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                              normalized: "{item.normalized_name || item.raw_test_name.toLowerCase()}"
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                            {item.occurrence_count} across {(item.reports && item.reports.length) || 1} report(s)
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                            {(item.observed_units && item.observed_units.join(', ')) || '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {topSuggestion ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                  {topSuggestion.canonical_name}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    backgroundColor:
                                      topSuggestion.similarity_score >= 80
                                        ? 'var(--success-soft)'
                                        : 'var(--warning-soft)',
                                    color:
                                      topSuggestion.similarity_score >= 80
                                        ? 'var(--success)'
                                        : 'var(--warning)',
                                    fontWeight: 700,
                                  }}
                                >
                                  {topSuggestion.similarity_score}% match
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                No close suggestion
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              {topSuggestion && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() =>
                                    handleAcceptSuggestion(item.raw_test_name, topSuggestion.test_id)
                                  }
                                  disabled={isSubmitting}
                                  style={{ fontSize: '12px', padding: '3px 8px' }}
                                >
                                  Accept Match
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setModalForRawName(item.raw_test_name);
                                  setManualSelectedTestId(topSuggestion?.test_id || '');
                                }}
                                style={{ fontSize: '12px', padding: '3px 8px' }}
                              >
                                Other...
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 2: CANONICAL TESTS CATALOG */}
      {activeTab === 'catalog' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <CardTitle style={{ fontSize: '16px' }}>Canonical Lab Test Catalog</CardTitle>
                <CardDescription>
                  Standardized dictionary of recognized lab analytes, standard reference units, and alias mappings.
                </CardDescription>
              </div>
              <Button size="sm" variant="primary" onClick={() => setShowCreateTestModal(true)}>
                ✚ Create Canonical Test
              </Button>
            </div>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Search & Category Filter */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Input
                placeholder="Search canonical tests..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                style={{ maxWidth: '280px' }}
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                }}
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Catalog Table */}
            <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Canonical Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Preferred Unit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Type</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aliases</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.canonical_name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{t.category || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{t.preferred_unit || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <Badge variant={t.is_seeded ? 'neutral' : 'info'}>
                          {t.is_seeded ? 'Seed' : 'User'}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t.aliases_count} alias{t.aliases_count !== 1 ? 'es' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Link Modal */}
      {modalForRawName && (
        <Modal
          isOpen={true}
          onClose={() => setModalForRawName(null)}
          title={`Map "${modalForRawName}"`}
          description="Choose an existing canonical test or create a new one to represent this analyte."
          maxWidth="500px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Select Canonical Test:
              </label>
              <select
                value={manualSelectedTestId}
                onChange={(e) => setManualSelectedTestId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                }}
              >
                <option value="">-- Choose Canonical Test --</option>
                {canonicalTests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.canonical_name} {t.category ? `(${t.category})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setNewTestName(modalForRawName);
                  setShowCreateTestModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                + Define New Canonical Test
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="sm" variant="secondary" onClick={() => setModalForRawName(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleManualMap}
                  disabled={!manualSelectedTestId || isSubmitting}
                >
                  Confirm Mapping
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Create New Canonical Test Modal */}
      {showCreateTestModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCreateTestModal(false)}
          title="Create New Canonical Test"
          description="Define a new standardized analyte for MedTimeline AI."
          maxWidth="480px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Canonical Name*
              </label>
              <Input
                placeholder="e.g. Total Testosterone"
                value={newTestName}
                onChange={(e) => setNewTestName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Category / Panel (Optional)
              </label>
              <Input
                placeholder="e.g. Hormones, Biochemistry, Immunology"
                value={newTestCategory}
                onChange={(e) => setNewTestCategory(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Preferred Measurement Unit (Optional)
              </label>
              <Input
                placeholder="e.g. ng/dL, mg/dL, mmol/L"
                value={newTestUnit}
                onChange={(e) => setNewTestUnit(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button size="sm" variant="secondary" onClick={() => setShowCreateTestModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleCreateCanonicalTest}
                disabled={!newTestName.trim() || isSubmitting}
              >
                Create Test
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
