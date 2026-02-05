/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

import { buttonStyle } from '@oxide/design-system'
import { useDialogStore } from '@ariakit/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, useLocation, useSearchParams } from 'react-router'

import Icon from '~/components/Icon'
import { useRootLoaderData } from '~/root'

import Modal from './Modal'

type FlowState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'confirming'; nextNumber: number; formattedNumber: string }
  | { type: 'connecting_github'; nextNumber: number; formattedNumber: string; isReconnect?: boolean }
  | { type: 'creating'; nextNumber: number; formattedNumber: string }
  | { type: 'done'; branchName: string; branchUrl: string }
  | { type: 'error'; message: string; canRetry: boolean }

const NewRfdButton = () => {
  const dialog = useDialogStore()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, localMode, hasGitHubRepoToken, githubRepoUrl } = useRootLoaderData()

  const [flowState, setFlowState] = useState<FlowState>({ type: 'idle' })
  const [editableNumber, setEditableNumber] = useState<number | null>(null)
  const [adjustedFrom, setAdjustedFrom] = useState<number | undefined>()

  const resetFlow = useCallback(() => {
    setFlowState({ type: 'idle' })
    setEditableNumber(null)
    setAdjustedFrom(undefined)
  }, [])

  const handleButtonClick = useCallback(async () => {
    if (!user) {
      // Not logged in - do nothing, the button shouldn't be visible anyway
      return
    }

    dialog.show()
    setFlowState({ type: 'loading' })

    try {
      const response = await fetch('/api/rfd/next-number')
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login?expired=true'
          return
        }
        setFlowState({
          type: 'error',
          message: data.error || 'Failed to get next RFD number',
          canRetry: true,
        })
        return
      }

      setEditableNumber(data.nextNumber)
      setAdjustedFrom(data.adjustedFrom)
      setFlowState({
        type: 'confirming',
        nextNumber: data.nextNumber,
        formattedNumber: data.formattedNumber,
      })
    } catch {
      setFlowState({
        type: 'error',
        message: 'Failed to connect to server',
        canRetry: true,
      })
    }
  }, [user, dialog])

  // Auto-open modal after GitHub OAuth callback
  const autoOpenRef = useRef(false)
  useEffect(() => {
    if (searchParams.get('create_rfd') === '1' && !autoOpenRef.current) {
      autoOpenRef.current = true
      setSearchParams((prev) => {
        prev.delete('create_rfd')
        return prev
      }, { replace: true })
      handleButtonClick()
    }
  }, [searchParams, setSearchParams, handleButtonClick])

  const handleCreateBranch = useCallback(async () => {
    if (flowState.type !== 'confirming' && flowState.type !== 'connecting_github') {
      return
    }

    const rfdNumber = editableNumber ?? flowState.nextNumber
    const formattedNumber = rfdNumber.toString().padStart(4, '0')

    // Check if we have GitHub token
    if (!hasGitHubRepoToken) {
      setFlowState({
        type: 'connecting_github',
        nextNumber: rfdNumber,
        formattedNumber,
        isReconnect: false,
      })
      return
    }

    setFlowState({ type: 'creating', nextNumber: rfdNumber, formattedNumber })

    try {
      const response = await fetch('/api/rfd/create-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfdNumber }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login?expired=true'
          return
        }

        if (data.code === 'github_auth_required' || data.code === 'auth_error') {
          setFlowState({
            type: 'connecting_github',
            nextNumber: rfdNumber,
            formattedNumber,
            isReconnect: data.code === 'auth_error',
          })
          return
        }

        setFlowState({
          type: 'error',
          message: data.error || 'Failed to create branch',
          canRetry: data.code !== 'branch_exists',
        })
        return
      }

      const actualNumber = data.rfdNumber
      const branchUrl = `${githubRepoUrl}/tree/${data.branchName}`

      // Open the GitHub new-file editor with a pre-filled template
      const template = generateTemplate(user?.displayName)
      const editorUrl = generateEditorUrl(githubRepoUrl, data.branchName, actualNumber, template)
      window.open(editorUrl, '_blank')

      setFlowState({
        type: 'done',
        branchName: data.branchName,
        branchUrl,
      })
    } catch {
      setFlowState({
        type: 'error',
        message: 'Failed to create branch',
        canRetry: true,
      })
    }
  }, [flowState, editableNumber, hasGitHubRepoToken, githubRepoUrl])

  const handleDialogClose = useCallback(() => {
    // Reset flow state when dialog is closed
    setTimeout(resetFlow, 200)
  }, [resetFlow])

  // Hide button in local mode or when not logged in
  if (localMode || !user) {
    return null
  }

  return (
    <>
      <button
        onClick={handleButtonClick}
        className="text-tertiary bg-secondary border-secondary elevation-1 hover:bg-tertiary flex h-8 w-8 items-center justify-center rounded border"
        aria-label="Create new RFD"
      >
        <Icon name="add-roundel" size={16} />
      </button>

      <Modal
        dialogStore={dialog}
        title="Create new RFD"
      >
        <div onAnimationEnd={handleDialogClose}>
          {flowState.type === 'loading' && <LoadingState />}

          {flowState.type === 'confirming' && (
            <ConfirmingState
              editableNumber={editableNumber ?? flowState.nextNumber}
              onNumberChange={(n) => {
                setEditableNumber(n)
                setAdjustedFrom(undefined)
              }}
              adjustedFrom={adjustedFrom}
              hasGitHubToken={hasGitHubRepoToken}
              onConfirm={handleCreateBranch}
              onCancel={() => dialog.hide()}
            />
          )}

          {flowState.type === 'connecting_github' && (
            <ConnectGitHubState
              formattedNumber={flowState.formattedNumber}
              returnTo={appendParam(location.pathname + location.search, 'create_rfd', '1')}
              isReconnect={flowState.isReconnect}
            />
          )}

          {flowState.type === 'creating' && (
            <CreatingState formattedNumber={flowState.formattedNumber} />
          )}

          {flowState.type === 'done' && (
            <DoneState
              branchName={flowState.branchName}
              branchUrl={flowState.branchUrl}
              onClose={() => dialog.hide()}
            />
          )}

          {flowState.type === 'error' && (
            <ErrorState
              message={flowState.message}
              canRetry={flowState.canRetry}
              onRetry={handleButtonClick}
              onClose={() => dialog.hide()}
            />
          )}
        </div>
      </Modal>
    </>
  )
}

/** Append a query param to a URL path, handling existing query strings */
function appendParam(url: string, key: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${key}=${value}`
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center py-4">
      <div className="border-accent-secondary mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      <p className="text-secondary">Getting next available RFD number...</p>
    </div>
  )
}

function ConfirmingState({
  editableNumber,
  onNumberChange,
  adjustedFrom,
  hasGitHubToken,
  onConfirm,
  onCancel,
}: {
  editableNumber: number
  onNumberChange: (n: number) => void
  adjustedFrom?: number
  hasGitHubToken: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const formattedNumber = editableNumber.toString().padStart(4, '0')

  return (
    <div>
      {adjustedFrom !== undefined && (
        <p className="text-notice bg-notice-secondary mb-4 rounded p-2 text-sans-sm">
          Note: RFD {adjustedFrom.toString().padStart(4, '0')} already has a branch. Adjusted to the next available number.
        </p>
      )}
      <p className="mb-4">
        Create a new branch for RFD{' '}
        <input
          type="number"
          value={editableNumber}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            if (!isNaN(val) && val > 0) {
              onNumberChange(val)
            }
          }}
          min={1}
          className="bg-raise border-secondary w-20 rounded border px-1.5 py-0.5 text-center font-mono text-sans-sm"
        />
        ?
      </p>
      <p className="text-tertiary text-sans-sm mb-6">
        This will create branch <code className="bg-raise border-secondary rounded border px-1 py-0.5">rfd-{formattedNumber}</code> and
        open the branch on GitHub.
      </p>

      {!hasGitHubToken && (
        <p className="text-notice bg-notice-secondary mb-4 rounded p-2 text-sans-sm">
          You'll need to connect your GitHub account to create branches.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className={buttonStyle({ size: 'sm', variant: 'secondary' })}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={buttonStyle({ size: 'sm' })}
        >
          {hasGitHubToken ? 'Create branch' : 'Connect GitHub & Create'}
        </button>
      </div>
    </div>
  )
}

function ConnectGitHubState({
  formattedNumber,
  returnTo,
  isReconnect,
}: {
  formattedNumber: string
  returnTo: string
  isReconnect?: boolean
}) {
  return (
    <div>
      {isReconnect && (
        <p className="text-notice bg-notice-secondary mb-4 rounded p-2 text-sans-sm">
          Your GitHub connection has expired or been revoked. Please reconnect to continue.
        </p>
      )}
      <p className="mb-4">
        To create branch <code className="bg-raise border-secondary rounded border px-1 py-0.5">rfd-{formattedNumber}</code>,
        you need to {isReconnect ? 'reconnect' : 'connect'} your GitHub account with repository access.
      </p>
      <p className="text-tertiary text-sans-sm mb-6">
        This grants temporary access to create branches in the RFD repository.
        Your GitHub credentials are stored securely in your session.
      </p>

      <Form method="post" action="/auth/github-repo">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex justify-end">
          <button
            type="submit"
            className={buttonStyle({ size: 'sm' })}
          >
            {isReconnect ? 'Reconnect GitHub' : 'Connect GitHub'}
          </button>
        </div>
      </Form>
    </div>
  )
}

function CreatingState({ formattedNumber }: { formattedNumber: string }) {
  return (
    <div className="flex flex-col items-center py-4">
      <div className="border-accent-secondary mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      <p className="text-secondary">Creating branch rfd-{formattedNumber}...</p>
    </div>
  )
}

function DoneState({
  branchName,
  branchUrl,
  onClose,
}: {
  branchName: string
  branchUrl: string
  onClose: () => void
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Icon name="success" size={12} className="text-accent-secondary" />
        <p>
          Branch <code className="bg-raise border-secondary rounded border px-1 py-0.5">{branchName}</code> created successfully!
        </p>
      </div>

      <p className="text-tertiary text-sans-sm mb-6">
        A new tab should have opened to the branch on GitHub. If not, click the link below:
      </p>
      <div className="mb-4">
        <a
          href={branchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-tertiary hover:text-accent-secondary break-all"
        >
          View branch on GitHub
        </a>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className={buttonStyle({ size: 'sm' })}
        >
          Done
        </button>
      </div>
    </div>
  )
}

function ErrorState({
  message,
  canRetry,
  onRetry,
  onClose,
}: {
  message: string
  canRetry: boolean
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Icon name="error" size={16} className="text-error" />
        <p className="text-error">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className={buttonStyle({ size: 'sm', variant: 'secondary' })}
        >
          Close
        </button>
        {canRetry && (
          <button
            onClick={onRetry}
            className={buttonStyle({ size: 'sm' })}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

function generateTemplate(authorName?: string): string {
  return `:authors: ${authorName || 'Your Name'}
:state: prediscussion
:discussion:
:labels:

= RFD Title Here

== Introduction

Describe the problem or opportunity this RFD addresses.

== Background

Provide relevant background information.

== Proposal

Describe your proposed solution.
`
}

function generateEditorUrl(
  githubRepoUrl: string,
  branchName: string,
  rfdNumber: number,
  template: string,
): string {
  const formattedNumber = rfdNumber.toString().padStart(4, '0')
  const filename = `rfd/${formattedNumber}/README.adoc`

  const params = new URLSearchParams({
    filename,
    value: template,
  })

  return `${githubRepoUrl}/new/${branchName}?${params.toString()}`
}

export default NewRfdButton
