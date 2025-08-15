import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WinRateByGeneration } from '@/components/charts/WinRateByGeneration';
import { GenerationData } from '@/types/projectcard';

const mockData: GenerationData[] = [
  { generation: 1, winRate: 0.45, avgEloChange: -2.5, gameCount: 50 },
  { generation: 2, winRate: 0.55, avgEloChange: 1.2, gameCount: 75 },
  { generation: 3, winRate: 0.65, avgEloChange: 3.8, gameCount: 100 },
  { generation: 4, winRate: 0.72, avgEloChange: 5.1, gameCount: 80 },
];

describe('WinRateByGeneration', () => {
  it('renders chart title', () => {
    render(<WinRateByGeneration data={mockData} />);
    expect(screen.getByText('Win Rate by Generation')).toBeInTheDocument();
  });

  it('renders chart description', () => {
    render(<WinRateByGeneration data={mockData} />);
    expect(screen.getByText('Shows win rate when card is played in each generation')).toBeInTheDocument();
  });

  it('renders SVG chart when data is provided', () => {
    const { container } = render(<WinRateByGeneration data={mockData} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '400');
    expect(svg).toHaveAttribute('height', '200');
  });

  it('renders data points for each generation', () => {
    const { container } = render(<WinRateByGeneration data={mockData} />);
    const dataPoints = container.querySelectorAll('circle[r="4"]');
    expect(dataPoints).toHaveLength(mockData.length);
  });

  it('renders hover areas for each data point', () => {
    const { container } = render(<WinRateByGeneration data={mockData} />);
    const hoverAreas = container.querySelectorAll('circle[r="12"]');
    expect(hoverAreas).toHaveLength(mockData.length);
  });

  it('shows "No data available" when data is empty', () => {
    render(<WinRateByGeneration data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('displays tooltip on hover with correct data', async () => {
    const user = userEvent.setup();
    const { container } = render(<WinRateByGeneration data={mockData} />);

    // Find the first hover area (invisible circle)
    const hoverArea = container.querySelector('circle[r="12"]');
    expect(hoverArea).toBeInTheDocument();

    // Mock mouse event
    const mockMouseEvent = {
      clientX: 150,
      clientY: 200,
    };

    // Trigger hover
    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    // Check tooltip appears with correct content
    expect(screen.getByText('Generation 1')).toBeInTheDocument();
    expect(screen.getByText('45.0%')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', async () => {
    const { container } = render(<WinRateByGeneration data={mockData} />);

    const hoverArea = container.querySelector('circle[r="12"]');
    expect(hoverArea).toBeInTheDocument();

    // Mock mouse event
    const mockMouseEvent = {
      clientX: 150,
      clientY: 200,
    };

    // Trigger hover
    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);
    expect(screen.getByText('Generation 1')).toBeInTheDocument();

    // Trigger mouse leave
    fireEvent.mouseLeave(hoverArea!);
    expect(screen.queryByText('Generation 1')).not.toBeInTheDocument();
  });

  it('renders Y-axis labels for percentages', () => {
    render(<WinRateByGeneration data={mockData} />);
    
    // Check for percentage labels (0%, 25%, 50%, 75%, 100%)
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders X-axis labels for generations', () => {
    render(<WinRateByGeneration data={mockData} />);
    
    // Check that generation numbers are displayed
    mockData.forEach(d => {
      expect(screen.getByText(d.generation.toString())).toBeInTheDocument();
    });
  });

  it('applies correct styling classes', () => {
    const { container } = render(<WinRateByGeneration data={mockData} />);
    
    const mainContainer = container.firstChild as HTMLElement;
    expect(mainContainer).toHaveClass(
      'bg-white',
      'dark:bg-slate-800',
      'rounded-xl',
      'border',
      'border-slate-200',
      'dark:border-slate-700',
      'p-6'
    );
  });

  it('displays win rate with blue color in tooltip', async () => {
    const { container } = render(<WinRateByGeneration data={mockData} />);

    const hoverArea = container.querySelector('circle[r="12"]');
    const mockMouseEvent = { clientX: 150, clientY: 200 };

    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    const winRateValue = screen.getByText('45.0%');
    expect(winRateValue).toHaveClass('text-blue-600', 'dark:text-blue-400');
  });

  it('formats game count with locale string in tooltip', async () => {
    const dataWithLargeCount: GenerationData[] = [
      { generation: 1, winRate: 0.45, avgEloChange: -2.5, gameCount: 1500 },
    ];

    const { container } = render(<WinRateByGeneration data={dataWithLargeCount} />);

    const hoverArea = container.querySelector('circle[r="12"]');
    const mockMouseEvent = { clientX: 150, clientY: 200 };

    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    // Check that large numbers are formatted with locale string (comma)
    expect(screen.getByText('1,500')).toBeInTheDocument();
  });
});