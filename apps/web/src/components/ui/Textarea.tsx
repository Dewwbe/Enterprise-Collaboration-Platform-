import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { fieldClasses } from './Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClasses, 'min-h-24 resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';
