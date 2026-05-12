import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../api/client'
import Spinner from '../components/ui/Spinner'
import Badge, { statusBadgeVariant } from '../components/ui/Badge'
import { formatDate } from '../utils/formatters'
import { FileLog, BackgroundJob } from '../types'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'jobs' | 'reconciliation'>('logs')

  const { data: fileLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['file-logs'],
    queryFn: () => apiClient.get('/admin/file-logs', { params: { limit: 100 } }).then((r) => r.data as FileLog[]),
    enabled: activeTab === 'logs',
  })
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['background-jobs'],
    queryFn: () => apiClient.get('/admin/jobs', { params: { limit: 100 } }).then((r) => r.data as BackgroundJob[]),
    enabled: activeTab === 'jobs',
  })
  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ['reconciliation-issues'],
    queryFn: () => apiClient.get('/admin/reconciliation').then((r) => r.data),
    enabled: activeTab === 'reconciliation',
  })

  const tabs = [
    { key: 'logs', label: 'File Logs' },
    { key: 'jobs', label: 'Background Jobs' },
    { key: 'reconciliation', label: 'Reconciliation' },
  ] as const

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'logs' && (
        <div className="card p-0 overflow-hidden">
          {logsLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Module</th>
                    <th className="table-header">Filename</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Total</th>
                    <th className="table-header text-right">Inserted</th>
                    <th className="table-header text-right">Rejected</th>
                    <th className="table-header">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {fileLogs?.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell"><span className="badge-blue">{log.module_name}</span></td>
                      <td className="table-cell text-gray-500 text-xs max-w-[200px]">
                        <span className="block truncate">{log.source_filename || '—'}</span>
                      </td>
                      <td className="table-cell">
                        <Badge label={log.status || '—'} variant={statusBadgeVariant(log.status)} />
                      </td>
                      <td className="table-cell text-right">{log.row_count_total?.toLocaleString() || '—'}</td>
                      <td className="table-cell text-right text-green-600">{log.row_count_inserted?.toLocaleString() || '—'}</td>
                      <td className="table-cell text-right text-red-500">{log.row_count_rejected?.toLocaleString() || '—'}</td>
                      <td className="table-cell text-gray-500">{formatDate(log.created_at)}</td>
                    </tr>
                  ))}
                  {!fileLogs?.length && <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No logs yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="card p-0 overflow-hidden">
          {jobsLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Job Type</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Started</th>
                    <th className="table-header">Completed</th>
                    <th className="table-header">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs?.map((job) => (
                    <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell font-medium">{job.job_type}</td>
                      <td className="table-cell">
                        <Badge label={job.status || '—'} variant={statusBadgeVariant(job.status)} />
                      </td>
                      <td className="table-cell text-gray-500 text-xs">{formatDate(job.started_at)}</td>
                      <td className="table-cell text-gray-500 text-xs">{formatDate(job.completed_at)}</td>
                      <td className="table-cell text-red-500 text-xs max-w-[200px]">
                        <span className="block truncate">{job.error_message || '—'}</span>
                      </td>
                    </tr>
                  ))}
                  {!jobs?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No jobs yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="card p-0 overflow-hidden">
          {issuesLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Issue Type</th>
                    <th className="table-header">Entity</th>
                    <th className="table-header">Severity</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {issues?.map((issue: any) => (
                    <tr key={issue.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell font-medium">{issue.issue_type}</td>
                      <td className="table-cell text-gray-500 text-xs">{issue.entity_key || '—'}</td>
                      <td className="table-cell">
                        <Badge label={issue.severity || 'INFO'} variant={issue.severity === 'HIGH' ? 'red' : issue.severity === 'MEDIUM' ? 'yellow' : 'gray'} />
                      </td>
                      <td className="table-cell">
                        <Badge label={issue.status || '—'} variant={statusBadgeVariant(issue.status)} />
                      </td>
                      <td className="table-cell text-gray-500">{formatDate(issue.created_at)}</td>
                    </tr>
                  ))}
                  {!issues?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No open issues</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
