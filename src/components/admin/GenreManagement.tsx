'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import {
  adminCreateGenreAction,
  adminUpdateGenreAction,
  adminDeleteGenreAction,
  adminReorderGenresAction,
} from '@/app/actions/admin';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Power,
  BookOpen,
} from 'lucide-react';

export interface GenreItem {
  id: string;
  slug: string;
  name_english: string;
  name_urdu: string;
  display_order: number;
  is_active: boolean;
  novel_count: number;
}

interface GenreManagementProps {
  initialGenres: GenreItem[];
}

export function GenreManagement({ initialGenres }: GenreManagementProps) {
  const router = useRouter();
  const [genres, setGenres] = useState<GenreItem[]>(initialGenres);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGenre, setEditingGenre] = useState<GenreItem | null>(null);
  const [deletingGenre, setDeletingGenre] = useState<GenreItem | null>(null);

  // Form states
  const [englishName, setEnglishName] = useState('');
  const [urduName, setUrduName] = useState('');
  const [slug, setSlug] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  const resetForm = () => {
    setEnglishName('');
    setUrduName('');
    setSlug('');
    setDisplayOrder(0);
    setIsActive(true);
    setEditingGenre(null);
    setIsCreateOpen(false);
    setDeletingGenre(null);
  };

  const handleOpenEdit = (genre: GenreItem) => {
    setEditingGenre(genre);
    setEnglishName(genre.name_english);
    setUrduName(genre.name_urdu);
    setSlug(genre.slug);
    setIsActive(genre.is_active);
    setDisplayOrder(genre.display_order);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await adminCreateGenreAction({
        nameEnglish: englishName.trim(),
        nameUrdu: urduName.trim(),
        slug: slug.trim() || undefined,
        displayOrder,
      });

      if (!res.success) {
        setError(res.error || 'Failed to create genre');
      } else {
        setSuccessMsg(`Genre "${englishName}" created successfully!`);
        resetForm();
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGenre) return;

    setLoading(true);
    setError(null);
    try {
      const res = await adminUpdateGenreAction({
        genreId: editingGenre.id,
        nameEnglish: englishName.trim(),
        nameUrdu: urduName.trim(),
        slug: slug.trim() || undefined,
        isActive,
      });

      if (!res.success) {
        setError(res.error || 'Failed to update genre');
      } else {
        setSuccessMsg(`Genre "${englishName}" updated!`);
        resetForm();
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (genre: GenreItem) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUpdateGenreAction({
        genreId: genre.id,
        nameEnglish: genre.name_english,
        nameUrdu: genre.name_urdu,
        slug: genre.slug,
        isActive: !genre.is_active,
      });

      if (!res.success) {
        setError(res.error || 'Failed to toggle status');
      } else {
        setSuccessMsg(`Genre "${genre.name_english}" status updated!`);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGenre) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminDeleteGenreAction(deletingGenre.id);
      if (!res.success) {
        setError(res.error || 'Failed to delete genre');
      } else {
        setSuccessMsg(`Genre "${deletingGenre.name_english}" deleted successfully!`);
        setDeletingGenre(null);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= genres.length) return;

    const newOrder = [...genres];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    const updates = newOrder.map((g, idx) => ({
      id: g.id,
      display_order: idx + 1,
    }));

    setGenres(
      newOrder.map((g, idx) => ({ ...g, display_order: idx + 1 }))
    );

    setLoading(true);
    try {
      const res = await adminReorderGenresAction(updates);
      if (!res.success) {
        setError(res.error || 'Failed to save new order');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-rose-600 hover:text-rose-900"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs text-emerald-600 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Showing {genres.length} genre categories. Active genres appear in author novel submission and public catalog filters.
        </p>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsCreateOpen(true);
          }}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-accent-admin hover:bg-accent-admin-dark text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Genre</span>
        </button>
      </div>

      {/* Genres List: Table for desktop, cards for mobile */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="w-full overflow-x-auto rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-muted font-medium text-[11px]">
              <tr>
                <th className="py-2.5 px-3 sm:px-4 w-14 text-center">Order</th>
                <th className="py-2.5 px-3 sm:px-4">English Name / Slug</th>
                <th className="py-2.5 px-3 sm:px-4">Urdu Title</th>
                <th className="py-2.5 px-3 sm:px-4">Assigned Novels</th>
                <th className="py-2.5 px-3 sm:px-4">Status</th>
                <th className="py-2.5 px-3 sm:px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-sans">
              {genres.map((genre, idx) => (
                <tr key={genre.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="py-2.5 px-3 sm:px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-mono text-muted font-bold w-5">
                        {genre.display_order}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(idx, 'up')}
                          disabled={idx === 0 || loading}
                          className="text-muted hover:text-main disabled:opacity-20 transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(idx, 'down')}
                          disabled={idx === genres.length - 1 || loading}
                          className="text-muted hover:text-main disabled:opacity-20 transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 sm:px-4">
                    <div className="font-semibold text-main">{genre.name_english}</div>
                    <div className="text-[10px] text-muted font-mono">/{genre.slug}</div>
                  </td>

                  <td className="py-2.5 px-3 sm:px-4">
                    <UrduText as="div" size="base" className="text-brand-gold font-medium py-0">
                      {genre.name_urdu}
                    </UrduText>
                  </td>

                  <td className="py-2.5 px-3 sm:px-4 font-mono whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-main">
                      <BookOpen className="w-3.5 h-3.5 text-muted" />
                      <span>{genre.novel_count} novel{genre.novel_count === 1 ? '' : 's'}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(genre)}
                      disabled={loading}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                        genre.is_active
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-surface-muted text-muted border border-border hover:bg-surface'
                      }`}
                    >
                      <Power className="w-2.5 h-2.5" />
                      <span>{genre.is_active ? 'Active' : 'Inactive'}</span>
                    </button>
                  </td>

                  <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(genre)}
                        disabled={loading}
                        className="p-1.5 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border transition-colors shadow-sm"
                        title="Edit Genre"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingGenre(genre)}
                        disabled={loading}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors shadow-sm"
                        title="Delete Genre"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {genres.map((genre, idx) => (
          <div
            key={genre.id}
            className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-main text-sm">{genre.name_english}</div>
                <UrduText as="div" size="sm" className="text-brand-gold py-0">
                  {genre.name_urdu}
                </UrduText>
                <div className="text-[10px] text-muted font-mono">/{genre.slug}</div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleActive(genre)}
                disabled={loading}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                  genre.is_active
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-surface-muted text-muted border border-border'
                }`}
              >
                <Power className="w-2.5 h-2.5" />
                <span>{genre.is_active ? 'Active' : 'Inactive'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted font-mono border-t border-border pt-2">
              <div className="flex items-center gap-1">
                <span>Order: {genre.display_order}</span>
                <button
                  type="button"
                  onClick={() => handleMoveOrder(idx, 'up')}
                  disabled={idx === 0 || loading}
                  className="p-1 text-muted hover:text-main disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveOrder(idx, 'down')}
                  disabled={idx === genres.length - 1 || loading}
                  className="p-1 text-muted hover:text-main disabled:opacity-20"
                >
                  ▼
                </button>
              </div>

              <div>{genre.novel_count} novel{genre.novel_count === 1 ? '' : 's'}</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => handleOpenEdit(genre)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={() => setDeletingGenre(genre)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Genre Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleCreate}
            className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-main font-serif">Create New Genre</h3>
                <p className="text-xs text-muted mt-0.5">
                  Taxonomy category for novels. English and Urdu names are both required.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Genre Name (English) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={englishName}
                  onChange={(e) => setEnglishName(e.target.value)}
                  placeholder="e.g. Mystery & Suspense"
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Genre Name (Urdu RTL) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={urduName}
                  onChange={(e) => setUrduName(e.target.value)}
                  placeholder="مثلاً: پراسرار اور سسپنس"
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin font-urdu"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-main block mb-1">
                    Slug (Optional)
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="auto-generated"
                    className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-main block mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(Number(e.target.value))}
                    className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={resetForm}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-main bg-surface hover:bg-surface-muted border border-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent-admin hover:bg-accent-admin-dark text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Create Genre</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Genre Modal */}
      {editingGenre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleUpdate}
            className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-main font-serif">Edit Genre</h3>
                <p className="text-xs text-muted mt-0.5">
                  Update taxonomy names, slug, or active marketplace visibility.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Genre Name (English) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={englishName}
                  onChange={(e) => setEnglishName(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Genre Name (Urdu RTL) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={urduName}
                  onChange={(e) => setUrduName(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin font-urdu"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="genre-active-checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded bg-surface border-border text-accent-admin focus:ring-accent-admin"
                />
                <label htmlFor="genre-active-checkbox" className="text-xs text-main font-medium cursor-pointer">
                  Active (visible in submission options and filters)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={resetForm}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-main bg-surface hover:bg-surface-muted border border-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent-admin hover:bg-accent-admin-dark text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Update Genre</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingGenre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-main font-serif">Delete Genre</h3>
                <p className="text-xs text-muted mt-1">
                  Are you sure you want to delete <span className="text-main font-semibold">&quot;{deletingGenre.name_english}&quot;</span>?
                </p>
              </div>
            </div>

            {deletingGenre.novel_count > 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <span className="font-bold block">Notice: In-Use Protection</span>
                <p>
                  This genre is currently linked to {deletingGenre.novel_count} novel(s). The database blocks deleting in-use genres to prevent orphaned catalog metadata. You should <span className="font-semibold text-main">deactivate</span> it instead.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted">
                This genre is not linked to any novels and can be safely deleted permanently.
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setDeletingGenre(null)}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-main bg-surface hover:bg-surface-muted border border-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
