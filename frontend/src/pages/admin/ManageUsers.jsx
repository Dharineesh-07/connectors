import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { PlusIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { listUsers, createUser, deactivateUser, resetPassword } from '../../api/admin'
import UserTable from '../../components/admin/UserTable'
import AddUserModal from '../../components/admin/AddUserModal'
import { useAuth } from '../../context/AuthContext'

export default function ManageUsers() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery(
    ['admin-users', page],
    () => listUsers({ page, limit: 20 }),
    { keepPreviousData: true }
  )

  const createMutation = useMutation(createUser, {
    onSuccess: () => {
      qc.invalidateQueries('admin-users')
      setShowAdd(false)
      toast.success('Employee created successfully')
    },
    onError: (err) =>
      toast.error(err.response?.data?.detail ?? 'Failed to create employee'),
  })

  const deactivateMutation = useMutation((u) => deactivateUser(u.id), {
    onSuccess: () => {
      qc.invalidateQueries('admin-users')
      toast.success('User deactivated')
    },
    onError: () => toast.error('Failed to deactivate user'),
  })

  const resetPwMutation = useMutation(({ id, pwd }) => resetPassword(id, pwd), {
    onSuccess: () => toast.success('Password reset successfully'),
    onError: () => toast.error('Failed to reset password'),
  })

  const handleDeactivate = (u) => {
    if (window.confirm(`Deactivate ${u.full_name}? They will lose access immediately.`))
      deactivateMutation.mutate(u)
  }

  const handleResetPassword = (u) => {
    const pwd = window.prompt(`Enter new password for ${u.full_name}:`)
    if (pwd) resetPwMutation.mutate({ id: u.id, pwd })
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-cn-charcoal">Manage Employees</h2>
          <p className="text-sm text-cn-gray-600 mt-0.5">
            {data?.total ?? '—'} total accounts
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cn-red hover:bg-cn-red-dark text-white rounded-lg text-sm font-semibold transition-fast shadow-card"
        >
          <PlusIcon className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-cn-gray-400 text-sm">
          <span className="animate-cn-spin inline-block w-4 h-4 border-2 border-cn-blue border-t-transparent rounded-full" />
          Loading…
        </div>
      ) : (
        <>
          <div className="bg-cn-white rounded-md overflow-hidden shadow-card border border-cn-gray-200">
            <UserTable
              users={data?.users ?? []}
              currentUserId={me?.id}
              onDeactivate={handleDeactivate}
              onResetPassword={handleResetPassword}
            />
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 bg-cn-white border border-cn-gray-200 rounded-lg text-sm text-cn-gray-600 hover:bg-cn-gray-100 disabled:opacity-40 transition-fast"
              >
                Previous
              </button>
              <span className="text-sm text-cn-gray-600 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 bg-cn-white border border-cn-gray-200 rounded-lg text-sm text-cn-gray-600 hover:bg-cn-gray-100 disabled:opacity-40 transition-fast"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onSubmit={(form) => createMutation.mutate(form)}
          loading={createMutation.isLoading}
        />
      )}
    </div>
  )
}
