import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import apiClient from '../api/client'

type DisclosureType = 'monthly' | 'sub-classification' | 'quarterly'

export default function DisclosurePage() {
  const [activeTab, setActiveTab] = useState<DisclosureType>('monthly')
  const [uploadDate, setUploadDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !uploadDate) throw new Error('File and date required')
      const form = new FormData()
      form.append('file', file)
      if (activeTab === 'quarterly') {
        form.append('report_quarter', uploadDate)
        const { data } = await apiClient.post('/disclosure/quarterly/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        return data
      } else if (activeTab === 'sub-classification') {
        form.append('report_month', uploadDate)
        const { data } = await apiClient.post('/disclosure/sub-classification/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        return data
      } else {
        form.append('report_month', uploadDate)
        const { data } = await apiClient.post('/disclosure/monthly/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        return data
      }
    },
    onSuccess: (result) => setUploadResult(JSON.stringify(result, null, 2)),
  })

  const tabs: { key: DisclosureType; label: string }[] = [
    { key: 'monthly', label: 'Monthly Disclosure' },
    { key: 'sub-classification', label: 'Sub-Classification' },
    { key: 'quarterly', label: 'Quarterly Disclosure' },
  ]

  return (
    <div className="p-6 space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setUploadResult(null) }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upload Card */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Upload {tabs.find((t) => t.key === activeTab)?.label} File
        </h3>
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                {activeTab === 'quarterly' ? 'Report Quarter Date' : 'Report Month Date'}
              </label>
              <input
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Excel File (.xls / .xlsx)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || !uploadDate || uploadMutation.isPending}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            <Upload size={14} />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload & Process'}
          </button>
          {uploadResult && (
            <pre className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 overflow-auto max-h-32">
              {uploadResult}
            </pre>
          )}
          {uploadMutation.isError && (
            <p className="text-sm text-red-600">{(uploadMutation.error as Error).message}</p>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">File Format Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-500">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-medium text-gray-700 mb-1">Monthly Disclosure</p>
            <p>AMFI monthly portfolio disclosure Excel. Filename: <code>ammmmyyyyrepo.xls</code></p>
            <p className="mt-1">Example: <code>amfeb2026repo.xls</code></p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-medium text-gray-700 mb-1">Sub-Classification</p>
            <p>AMFI sub-classification Excel. Filename: <code>Sub-classification-MmmYY.xlsx</code></p>
            <p className="mt-1">Example: <code>Sub-classification-Feb26.xlsx</code></p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-medium text-gray-700 mb-1">Quarterly Disclosure</p>
            <p>AMFI quarterly Excel. Filename: <code>aqu-volyy-issueN.xls</code></p>
            <p className="mt-1">Example: <code>aqu-vol24-issueIV.xls</code></p>
          </div>
        </div>
      </div>
    </div>
  )
}
