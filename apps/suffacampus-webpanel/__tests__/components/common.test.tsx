/**
 * Component tests for common UI components.
 * Covers Button, Input, Badge, Modal, EmptyState, ConfirmDialog.
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Lucide mock (SVGs cause jsdom issues) ────────────────────────────
jest.mock('lucide-react', () => ({
  Loader2: (props: Record<string, unknown>) => <span data-testid="loader" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="alert-circle" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x-icon" {...props} />,
  Inbox: (props: Record<string, unknown>) => <span data-testid="inbox-icon" {...props} />,
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="alert-triangle" {...props} />,
  Info: (props: Record<string, unknown>) => <span data-testid="info-icon" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="x-circle" {...props} />,
}));

import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Badge from '@/components/common/Badge';
import Modal from '@/components/common/Modal';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// ═════════════════════════════════════════════════════════════════════
// Button
// ═════════════════════════════════════════════════════════════════════

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    const { rerender } = render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600');

    rerender(<Button variant="danger">Go</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
  });

  it('applies size classes', () => {
    render(<Button size="sm">Go</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-3');
  });

  it('shows loader when isLoading', () => {
    render(<Button isLoading>Saving</Button>);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Go</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick} disabled>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// Input
// ═════════════════════════════════════════════════════════════════════

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(<Input label="Name" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows error message with alert role', () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email');
  });

  it('sets aria-invalid on error', () => {
    render(<Input label="Email" error="Invalid" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows hint when no error', () => {
    render(<Input label="Name" hint="Enter your full name" />);
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
  });

  it('hides hint when error is present', () => {
    render(<Input label="Name" hint="Enter your full name" error="Required" />);
    expect(screen.queryByText('Enter your full name')).not.toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('accepts user input', async () => {
    const onChange = jest.fn();
    render(<Input label="Name" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Alice');
    expect(onChange).toHaveBeenCalledTimes(5); // A-l-i-c-e
  });
});

// ═════════════════════════════════════════════════════════════════════
// Badge
// ═════════════════════════════════════════════════════════════════════

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    const { container } = render(<Badge variant="success">Pass</Badge>);
    expect(container.firstChild).toHaveClass('bg-emerald-50');
  });

  it('applies size classes', () => {
    const { container } = render(<Badge size="lg">Big</Badge>);
    expect(container.firstChild).toHaveClass('px-3');
  });

  it('renders dot when dot=true', () => {
    const { container } = render(<Badge dot variant="danger">Alert</Badge>);
    const dot = container.querySelector('.bg-red-500');
    expect(dot).toBeInTheDocument();
  });

  it('does not render dot by default', () => {
    const { container } = render(<Badge variant="danger">Alert</Badge>);
    const dot = container.querySelector('.bg-red-500');
    expect(dot).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════
// Modal
// ═════════════════════════════════════════════════════════════════════

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="My Modal">Body text</Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('My Modal')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Title" subtitle="Sub">X</Modal>);
    expect(screen.getByText('Sub')).toBeInTheDocument();
  });

  it('has aria-modal and aria-labelledby', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Dialog">X</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="X">Body</Modal>);
    await userEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="X">Body</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on overlay click', async () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="X">Body</Modal>);
    // Overlay has aria-hidden="true"
    const overlay = screen.getByRole('dialog').querySelector('[aria-hidden="true"]');
    if (overlay) await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// EmptyState
// ═════════════════════════════════════════════════════════════════════

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<EmptyState title="No items" description="Add your first item" />);
    expect(screen.getByText('Add your first item')).toBeInTheDocument();
  });

  it('renders default icon when none provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByTestId('inbox-icon')).toBeInTheDocument();
  });

  it('renders custom icon', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="custom-icon" />} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-icon')).not.toBeInTheDocument();
  });

  it('renders action button and fires onClick', async () => {
    const onClick = jest.fn();
    render(<EmptyState title="Empty" action={{ label: 'Add item', onClick }} />);
    const btn = screen.getByRole('button', { name: 'Add item' });
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render action when omitted', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════
// ConfirmDialog
// ═════════════════════════════════════════════════════════════════════

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Delete item?',
    message: 'This action cannot be undone.',
  };

  beforeEach(() => {
    defaultProps.onClose = jest.fn();
    defaultProps.onConfirm = jest.fn();
  });

  it('renders nothing when isOpen=false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders alert dialog when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-message');
  });

  it('fires onConfirm when confirm button clicked', async () => {
    render(<ConfirmDialog {...defaultProps} confirmText="Delete" />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when cancel button clicked', async () => {
    render(<ConfirmDialog {...defaultProps} cancelText="Nevermind" />);
    await userEvent.click(screen.getByRole('button', { name: 'Nevermind' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('uses default button texts', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows loading state on confirm button', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    // The confirm button should be disabled and show loader
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmBtn).toBeDisabled();
  });
});
