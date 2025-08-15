import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EloGainByGeneration } from '@/components/charts/EloGainByGeneration';
import { GenerationData } from '@/types/projectcard';

const mockData: GenerationData[] = [
  { generation: 1, winRate: 0.45, avgEloChange: -2.5, gameCount: 50 },
  { generation: 2, winRate: 0.55, avgEloChange: 1.2, gameCount: 75 },
  { generation: 3, winRate: 0.65, avgEloChange: 3.8, gameCount: 100 },
  { generation: 4, winRate: 0.72, avgEloChange: -1.1, gameCount: 80 },
];

describe('EloGainByGeneration', () => {
  it('renders chart title', () => {
    render(<EloGainByGeneration data={mockData} />);
    expect(screen.getByText('Avg Elo Gain by Generation')).toBeInTheDocument();
  });

  it('renders chart description', () => {
    render(<EloGainByGeneration data={mockData} />);
    expect(screen.getByText('Shows average elo change when card is played in each generation')).toBeInTheDocument();
  });

  it('renders SVG chart when data is provided', () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '400');
    expect(svg).toHaveAttribute('height', '200');
  });

  it('renders data points for each generation', () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);
    const dataPoints = container.querySelectorAll('circle[r="4"]');
    expect(dataPoints).toHaveLength(mockData.length);
  });

  it('renders hover areas for each data point', () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);
    const hoverAreas = container.querySelectorAll('circle[r="12"]');
    expect(hoverAreas).toHaveLength(mockData.length);
  });

  it('shows "No data available" when data is empty', () => {
    render(<EloGainByGeneration data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('colors positive elo change points green and negative red', () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);
    const dataPoints = container.querySelectorAll('circle[r="4"]');

    // First point (negative elo change) should be red
    expect(dataPoints[0]).toHaveClass('text-red-500');
    
    // Second point (positive elo change) should be green
    expect(dataPoints[1]).toHaveClass('text-green-500');
    
    // Third point (positive elo change) should be green
    expect(dataPoints[2]).toHaveClass('text-green-500');
    
    // Fourth point (negative elo change) should be red
    expect(dataPoints[3]).toHaveClass('text-red-500');
  });

  it('displays tooltip on hover with correct data for positive elo change', async () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);

    // Find the second hover area (positive elo change)
    const hoverAreas = container.querySelectorAll('circle[r="12"]');
    const secondHoverArea = hoverAreas[1];

    const mockMouseEvent = {
      clientX: 150,
      clientY: 200,
    };

    // Trigger hover
    fireEvent.mouseEnter(secondHoverArea, mockMouseEvent);

    // Check tooltip appears with correct content
    expect(screen.getByText('Generation 2')).toBeInTheDocument();
    expect(screen.getByText('+1.20')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('displays tooltip on hover with correct data for negative elo change', async () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);

    // Find the first hover area (negative elo change)
    const hoverArea = container.querySelector('circle[r="12"]');
    expect(hoverArea).toBeInTheDocument();

    const mockMouseEvent = {
      clientX: 150,
      clientY: 200,
    };

    // Trigger hover
    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    // Check tooltip appears with correct content
    expect(screen.getByText('Generation 1')).toBeInTheDocument();
    expect(screen.getByText('-2.50')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('applies correct color to positive elo change in tooltip', async () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);

    const hoverAreas = container.querySelectorAll('circle[r="12"]');
    const positiveEloHoverArea = hoverAreas[1]; // Second point has positive elo change

    const mockMouseEvent = { clientX: 150, clientY: 200 };
    fireEvent.mouseEnter(positiveEloHoverArea, mockMouseEvent);

    const eloValue = screen.getByText('+1.20');
    expect(eloValue).toHaveClass('text-green-600', 'dark:text-green-400');
  });

  it('applies correct color to negative elo change in tooltip', async () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);

    const hoverArea = container.querySelector('circle[r="12"]'); // First point has negative elo change

    const mockMouseEvent = { clientX: 150, clientY: 200 };
    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    const eloValue = screen.getByText('-2.50');
    expect(eloValue).toHaveClass('text-red-600', 'dark:text-red-400');
  });

  it('hides tooltip on mouse leave', async () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);

    const hoverArea = container.querySelector('circle[r="12"]');
    expect(hoverArea).toBeInTheDocument();

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

  it('renders zero line (dashed line)', () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);
    const zeroLine = container.querySelector('line[stroke-dasharray="5,5"]');
    expect(zeroLine).toBeInTheDocument();
  });

  it('renders Y-axis labels for elo changes', () => {
    render(<EloGainByGeneration data={mockData} />);
    
    // Should have labels for negative, zero, and positive values
    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('renders X-axis labels for generations', () => {
    render(<EloGainByGeneration data={mockData} />);
    
    // Check that generation numbers are displayed
    mockData.forEach(d => {
      expect(screen.getByText(d.generation.toString())).toBeInTheDocument();
    });
  });

  it('applies correct styling classes', () => {
    const { container } = render(<EloGainByGeneration data={mockData} />);
    
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

  it('formats elo change to 2 decimal places in tooltip', async () => {
    const dataWithPreciseElo: GenerationData[] = [
      { generation: 1, winRate: 0.45, avgEloChange: 2.123456, gameCount: 50 },
    ];

    const { container } = render(<EloGainByGeneration data={dataWithPreciseElo} />);

    const hoverArea = container.querySelector('circle[r="12"]');
    const mockMouseEvent = { clientX: 150, clientY: 200 };

    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    // Check that elo change is formatted to 2 decimal places
    expect(screen.getByText('+2.12')).toBeInTheDocument();
  });

  it('formats game count with locale string in tooltip', async () => {
    const dataWithLargeCount: GenerationData[] = [
      { generation: 1, winRate: 0.45, avgEloChange: 2.5, gameCount: 2500 },
    ];

    const { container } = render(<EloGainByGeneration data={dataWithLargeCount} />);

    const hoverArea = container.querySelector('circle[r="12"]');
    const mockMouseEvent = { clientX: 150, clientY: 200 };

    fireEvent.mouseEnter(hoverArea!, mockMouseEvent);

    // Check that large numbers are formatted with locale string (comma)
    expect(screen.getByText('2,500')).toBeInTheDocument();
  });
});