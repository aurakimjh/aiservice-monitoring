import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

describe('Button', () => {
  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is set', async () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Test</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('custom-class');
  });

  it('renders all variants without throwing', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger', 'outline'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
      unmount();
    }
  });

  it('renders all sizes without throwing', () => {
    const sizes = ['sm', 'md', 'lg', 'icon'] as const;
    for (const size of sizes) {
      const { unmount } = render(<Button size={size}>{size}</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
      unmount();
    }
  });

  it('forwards ref correctly', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
    render(<Button ref={ref}>Ref button</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('passes through aria attributes', () => {
    render(<Button aria-label="Close dialog">X</Button>);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('passes through type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
