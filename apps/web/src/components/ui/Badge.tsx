import type { HTMLAttributes } from 'react';
import { TaskPriority, TaskStatus } from '@ecp/shared-types';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'blue' | 'yellow' | 'green' | 'red';

// Written as fully static strings (no `bg-${tone}-100` interpolation) since
// Tailwind's content scanner only picks up class names it can see literally.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-200 text-slate-700',
  blue: 'bg-blue-100 text-blue-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

export const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  [TaskStatus.TODO]: 'neutral',
  [TaskStatus.IN_PROGRESS]: 'blue',
  [TaskStatus.REVIEW]: 'yellow',
  [TaskStatus.DONE]: 'green',
};

export const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  [TaskPriority.LOW]: 'neutral',
  [TaskPriority.MEDIUM]: 'neutral',
  [TaskPriority.HIGH]: 'red',
  [TaskPriority.URGENT]: 'red',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'To do',
  [TaskStatus.IN_PROGRESS]: 'In progress',
  [TaskStatus.REVIEW]: 'Review',
  [TaskStatus.DONE]: 'Done',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Low',
  [TaskPriority.MEDIUM]: 'Medium',
  [TaskPriority.HIGH]: 'High',
  [TaskPriority.URGENT]: 'Urgent',
};
