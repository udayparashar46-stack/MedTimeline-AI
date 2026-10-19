import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { patientsApi, type Patient } from './lib/apiClient';

describe('Milestone 2: Patient Workspaces', () => {
  const mockPatients: Patient[] = [
    {
      id: 'patient-uuid-1',
      display_name: 'Sarah Jenkins',
      date_of_birth: '1988-06-12',
      sex: 'female',
      notes: 'Serial monitoring for iron deficiency anemia',
      owner_id: null,
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
    },
    {
      id: 'patient-uuid-2',
      display_name: 'Robert Chen',
      date_of_birth: '1975-02-20',
      sex: 'male',
      notes: 'Lipid panel follow-up',
      owner_id: null,
      created_at: '2026-10-18T11:00:00Z',
      updated_at: '2026-10-18T11:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    // Default mock for health check
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/health')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ok' }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Not found' }),
      } as Response;
    });
  });

  it('navigates from sidebar to Patients page and displays patient list', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValueOnce({
      items: mockPatients,
      total: 2,
    });

    render(<App />);

    // Click Patients in sidebar
    const patientsNavBtn = screen.getByRole('button', { name: /patients/i });
    fireEvent.click(patientsNavBtn);

    expect(screen.getByRole('heading', { name: /patient workspaces/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
      expect(screen.getByText('Robert Chen')).toBeInTheDocument();
      expect(screen.getByText('2 workspaces')).toBeInTheDocument();
    });
  });

  it('displays empty state when no patient workspaces exist', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByText('No patient workspaces yet')).toBeInTheDocument();
      expect(
        screen.getByText(/create your first patient workspace to start uploading lab reports/i),
      ).toBeInTheDocument();
    });
  });

  it('opens Create Patient modal and validates required name field', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [],
      total: 0,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create new patient workspace/i })).toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /create new patient workspace/i }));

    expect(screen.getByRole('heading', { name: 'New Patient Workspace' })).toBeInTheDocument();

    // Try to submit with blank name
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));

    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeInTheDocument();
    });
  });

  it('creates a new patient workspace successfully and navigates to workspace view', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [],
      total: 0,
    });

    const newPatient: Patient = {
      id: 'patient-uuid-new',
      display_name: 'Elena Rostova',
      date_of_birth: '1992-11-04',
      sex: 'female',
      notes: 'Thyroid profile tracking',
      owner_id: null,
      created_at: '2026-10-18T12:00:00Z',
      updated_at: '2026-10-18T12:00:00Z',
    };

    const createSpy = vi.spyOn(patientsApi, 'create').mockResolvedValueOnce(newPatient);
    vi.spyOn(patientsApi, 'get').mockResolvedValueOnce(newPatient);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create new patient workspace/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /create new patient workspace/i }));

    // Fill in form
    const nameInput = screen.getByLabelText(/workspace label \/ patient name \*/i);
    fireEvent.change(nameInput, { target: { value: 'Elena Rostova' } });

    const notesInput = screen.getByLabelText(/notes \(optional\)/i);
    fireEvent.change(notesInput, { target: { value: 'Thyroid profile tracking' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        display_name: 'Elena Rostova',
        date_of_birth: null,
        sex: null,
        notes: 'Thyroid profile tracking',
      });
    });

    // Should navigate to workspace detail
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Elena Rostova' })).toBeInTheDocument();
      expect(screen.getByText('Thyroid profile tracking')).toBeInTheDocument();
      expect(screen.getByText('Lab Reports')).toBeInTheDocument();
    });
  });

  it('navigates from patient workspace back to patients list via breadcrumb', async () => {
    const patient: Patient = mockPatients[0];
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [patient],
      total: 1,
    });
    vi.spyOn(patientsApi, 'get').mockResolvedValue(patient);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
    });

    // Click on Open -> to view workspace
    fireEvent.click(screen.getByRole('button', { name: /open sarah jenkins's workspace/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sarah Jenkins' })).toBeInTheDocument();
    });

    // Click breadcrumb back
    fireEvent.click(screen.getByRole('button', { name: /back to patients list/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /patient workspaces/i })).toBeInTheDocument();
    });
  });

  it('requires typed confirmation before enabling delete in DeletePatientModal', async () => {
    const patient: Patient = mockPatients[0];
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: [patient],
      total: 1,
    });
    const deleteSpy = vi.spyOn(patientsApi, 'delete').mockResolvedValueOnce(undefined);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /patients/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete sarah jenkins/i })).toBeInTheDocument();
    });

    // Open delete modal
    fireEvent.click(screen.getByRole('button', { name: /delete sarah jenkins/i }));

    expect(screen.getByRole('heading', { name: 'Delete Workspace' })).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /permanently delete this workspace/i });
    expect(deleteBtn).toBeDisabled();

    // Type partial or wrong name
    const confirmInput = screen.getByLabelText(/type "sarah jenkins" to confirm deletion/i);
    fireEvent.change(confirmInput, { target: { value: 'Sarah' } });
    expect(deleteBtn).toBeDisabled();

    // Type exact name
    fireEvent.change(confirmInput, { target: { value: 'Sarah Jenkins' } });
    expect(deleteBtn).not.toBeDisabled();

    // Click delete
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('patient-uuid-1');
    });
  });

  it('navigates from the Medical Dashboard to Patients page via New Patient button and table', async () => {
    vi.spyOn(patientsApi, 'list').mockResolvedValue({
      items: mockPatients,
      total: 2,
    });

    render(<App />);

    // Click New Patient on dashboard
    fireEvent.click(screen.getByRole('button', { name: /new patient/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /patient workspaces/i })).toBeInTheDocument();
    });
  });
});
