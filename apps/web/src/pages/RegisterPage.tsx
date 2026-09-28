import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, tokenStore, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';

export function RegisterPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const { refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const update = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const tokens = await api.auth.register(form);
      tokenStore.set(tokens);
      await refreshUser();
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            E
          </span>
          <h1 className="text-xl font-semibold text-slate-900">Create an account</h1>
          <p className="text-sm text-slate-500">Join your team on ECP Platform.</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" value={form.firstName} onChange={update('firstName')} required />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <Input id="lastName" value={form.lastName} onChange={update('lastName')} required />
            </Field>
          </div>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              required
            />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update('password')}
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" disabled={submitting} className="mt-2 w-full">
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
