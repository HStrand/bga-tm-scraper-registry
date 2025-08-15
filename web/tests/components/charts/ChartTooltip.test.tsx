import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartTooltip, TooltipContent } from '@/components/charts/ChartTooltip';

describe('ChartTooltip', () => {
  beforeEach(() => {
    // Reset viewport dimensions for each test
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  it('renders tooltip when visible is true', () => {
    render(
      <ChartTooltip visible={true} x={100} y={100}>
        <div>Test content</div>
      </ChartTooltip>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('does not render tooltip when visible is false', () => {
    render(
      <ChartTooltip visible={false} x={100} y={100}>
        <div>Test content</div>
      </ChartTooltip>
    );

    expect(screen.queryByText('Test content')).not.toBeInTheDocument();
  });

  it('applies correct positioning styles', () => {
    const { container } = render(
      <ChartTooltip visible={true} x={150} y={200}>
        <div>Test content</div>
      </ChartTooltip>
    );

    const tooltip = container.firstChild as HTMLElement;
    
    // Check that the positioning classes are applied
    expect(tooltip).toHaveClass('fixed');
    
    // Check inline styles that are set via the style prop
    expect(tooltip).toHaveStyle({
      left: '150px',
      top: '200px',
      transform: 'translate(10px, -50%)',
    });
  });

  it('has correct CSS classes for styling', () => {
    const { container } = render(
      <ChartTooltip visible={true} x={100} y={100}>
        <div>Test content</div>
      </ChartTooltip>
    );

    const tooltip = container.firstChild as HTMLElement;
    expect(tooltip).toHaveClass(
      'fixed',
      'z-50',
      'bg-white',
      'dark:bg-slate-800',
      'border',
      'border-slate-200',
      'dark:border-slate-600',
      'rounded-lg',
      'shadow-lg',
      'p-3',
      'pointer-events-none',
      'transition-opacity',
      'duration-200'
    );
  });
});

describe('TooltipContent', () => {
  it('renders title correctly', () => {
    const stats = [
      { label: 'Test Label', value: 'Test Value' }
    ];

    render(<TooltipContent title="Test Title" stats={stats} />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toHaveClass('font-semibold');
  });

  it('renders all stats with labels and values', () => {
    const stats = [
      { label: 'Win Rate', value: '75.5%' },
      { label: 'Games', value: '100' },
      { label: 'Elo Change', value: '+15.2' }
    ];

    render(<TooltipContent title="Generation 3" stats={stats} />);

    // Check all labels are present
    expect(screen.getByText('Win Rate:')).toBeInTheDocument();
    expect(screen.getByText('Games:')).toBeInTheDocument();
    expect(screen.getByText('Elo Change:')).toBeInTheDocument();

    // Check all values are present
    expect(screen.getByText('75.5%')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('+15.2')).toBeInTheDocument();
  });

  it('applies custom colors to stat values when provided', () => {
    const stats = [
      { 
        label: 'Win Rate', 
        value: '75.5%', 
        color: 'text-blue-600 dark:text-blue-400' 
      },
      { 
        label: 'Elo Change', 
        value: '+15.2', 
        color: 'text-green-600 dark:text-green-400' 
      }
    ];

    render(<TooltipContent title="Test" stats={stats} />);

    const winRateValue = screen.getByText('75.5%');
    const eloChangeValue = screen.getByText('+15.2');

    expect(winRateValue).toHaveClass('text-blue-600', 'dark:text-blue-400');
    expect(eloChangeValue).toHaveClass('text-green-600', 'dark:text-green-400');
  });

  it('uses default color when no custom color is provided', () => {
    const stats = [
      { label: 'Games', value: '100' }
    ];

    render(<TooltipContent title="Test" stats={stats} />);

    const value = screen.getByText('100');
    expect(value).toHaveClass('text-slate-900', 'dark:text-slate-100');
  });

  it('has correct layout classes', () => {
    const stats = [
      { label: 'Test Label', value: 'Test Value' }
    ];

    const { container } = render(<TooltipContent title="Test" stats={stats} />);

    // Check main container has text-sm class
    const mainContainer = container.firstChild as HTMLElement;
    expect(mainContainer).toHaveClass('text-sm');

    // Check stats container has space-y-1 class
    const statsContainer = mainContainer.querySelector('.space-y-1');
    expect(statsContainer).toBeInTheDocument();
  });
});