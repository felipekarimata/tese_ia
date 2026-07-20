import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { startPipelineExecution } from '@/lib/pipeline/engine';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * POST /api/pipeline/[id]/approve
 * Approve current operation and continue pipeline
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { approvedItems }: { approvedItems: string[] } = await req.json();

    console.log(`[PIPELINE-APPROVE] Job ${jobId}, approved items:`, approvedItems);

    // Load pipeline job
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Pipeline job not found' },
        { status: 404 }
      );
    }

    // Verify status is awaiting_approval
    if (job.status !== 'awaiting_approval') {
      return NextResponse.json(
        { error: 'Pipeline is not awaiting approval' },
        { status: 400 }
      );
    }

    // Update current operation result with approved items
    const currentIndex = job.current_operation_index;
    const operationResults = [...(job.operation_results || [])];

    if (operationResults[currentIndex]) {
      operationResults[currentIndex] = {
        ...operationResults[currentIndex],
        approvalStatus: 'approved',
        approvedItems,
        status: 'completed' // Change from awaiting_approval to completed
      };
    }

    // Update job with approved items
    await supabase
      .from('pipeline_jobs')
      .update({
        operation_results: operationResults,
        status: 'applying_changes'
      })
      .eq('id', jobId);

    console.log(`[PIPELINE-APPROVE] Updated job ${jobId}, starting apply process`);

    // Apply changes in background
    applyApprovedChanges(jobId, currentIndex, approvedItems).catch(err => {
      console.error('[PIPELINE-APPROVE] Error applying changes:', err);
    });

    return NextResponse.json({
      message: 'Approval received, applying changes...'
    });

  } catch (error: any) {
    console.error('[PIPELINE-APPROVE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Apply approved changes and continue pipeline
 */
async function applyApprovedChanges(
  jobId: string,
  operationIndex: number,
  approvedItems: string[]
) {
  try {
    // Load job
    const { data: job, error } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      throw new Error('Job not found');
    }

    const currentOperation = job.selected_operations[operationIndex];
    const operationResult = job.operation_results[operationIndex];

    console.log(`[PIPELINE-APPROVE] Applying ${approvedItems.length} changes for ${currentOperation}`);

    // Apply changes based on operation type
    let appliedDocumentPath: string | null = null;

    if (currentOperation === 'improve') {
      appliedDocumentPath = await applyImproveChanges(
        operationResult.operationJobId,
        approvedItems
      );
    } else if (currentOperation === 'update') {
      appliedDocumentPath = await applyNormsChanges(
        operationResult.operationJobId,
        approvedItems
      );
    } else if (currentOperation === 'adjust') {
      appliedDocumentPath = await applyAdjustChanges(
        operationResult.operationJobId,
        approvedItems
      );
    } else if (currentOperation === 'adapt') {
      appliedDocumentPath = await applyAdaptChanges(
        operationResult.operationJobId,
        approvedItems
      );
    }
    // translate doesn't need approval/apply - it just translates

    // Save applied document as intermediate
    if (appliedDocumentPath) {
      await saveIntermediateDocument(
        jobId,
        currentOperation,
        operationIndex,
        appliedDocumentPath,
        operationResult
      );
      console.log(`[PIPELINE-APPROVE] Applied document saved: ${appliedDocumentPath}`);
    }

    // Update operation result with applied document
    const updatedResults = [...job.operation_results];
    updatedResults[operationIndex] = {
      ...updatedResults[operationIndex],
      outputDocumentPath: appliedDocumentPath || updatedResults[operationIndex].outputDocumentPath
    };

    // Move to next operation
    await supabase
      .from('pipeline_jobs')
      .update({
        operation_results: updatedResults,
        current_operation_index: operationIndex + 1,
        status: 'running'
      })
      .eq('id', jobId);

    console.log(`[PIPELINE-APPROVE] Moving to next operation (${operationIndex + 1})`);

    // Continue pipeline execution
    startPipelineExecution(jobId);

  } catch (error: any) {
    console.error('[PIPELINE-APPROVE] Apply error:', error);

    // Mark as failed
    await supabase
      .from('pipeline_jobs')
      .update({
        status: 'failed',
        error_message: `Failed to apply changes: ${error.message}`
      })
      .eq('id', jobId);
  }
}

/**
 * Apply improve changes (call existing API)
 */
async function applyImproveChanges(
  improveJobId: string,
  approvedSuggestionIds: string[]
): Promise<string> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/improve/${improveJobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedSuggestionIds: approvedSuggestionIds })
  });

  if (!res.ok) {
    throw new Error('Failed to apply improve changes');
  }

  // The apply API returns the document as download
  // We need to save it temporarily
  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to temp location
  const tempPath = path.join(os.tmpdir(), `pipeline_improved_${improveJobId}_${Date.now()}.docx`);
  await fs.writeFile(tempPath, buffer);

  return tempPath;
}

/**
 * Apply norms update changes (call existing API)
 */
async function applyNormsChanges(
  normsJobId: string,
  approvedReferenceIds: string[]
): Promise<string> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/norms-update/${normsJobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedReferenceIds: approvedReferenceIds })
  });

  if (!res.ok) {
    throw new Error('Failed to apply norms changes');
  }

  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const tempPath = path.join(os.tmpdir(), `pipeline_norms_${normsJobId}_${Date.now()}.docx`);
  await fs.writeFile(tempPath, buffer);

  return tempPath;
}

/**
 * Apply adjust changes (call existing API)
 */
async function applyAdjustChanges(
  adjustJobId: string,
  approvedSuggestionIds: string[]
): Promise<string> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/adjust/${adjustJobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedSuggestionIds: approvedSuggestionIds })
  });

  if (!res.ok) {
    throw new Error('Failed to apply adjust changes');
  }

  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const tempPath = path.join(os.tmpdir(), `pipeline_adjust_${adjustJobId}_${Date.now()}.docx`);
  await fs.writeFile(tempPath, buffer);

  return tempPath;
}

/**
 * Apply adapt changes (call existing API)
 */
async function applyAdaptChanges(
  adaptJobId: string,
  approvedSuggestionIds: string[]
): Promise<string> {
  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3001';
  const url = `${apiUrl}/api/adapt/${adaptJobId}/apply`;
  
  console.log(`[PIPELINE-APPROVE] Calling adapt apply API: ${url}`);
  
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedSuggestionIds: approvedSuggestionIds }),
      signal: AbortSignal.timeout(60000) // 60 second timeout for file download
    });
  } catch (fetchError: any) {
    console.error(`[PIPELINE-APPROVE] Fetch error calling adapt apply API:`, fetchError);
    throw new Error(`Failed to connect to adapt apply API: ${fetchError.message || 'Network error'}. URL: ${url}`);
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[PIPELINE-APPROVE] Adapt apply API error (${res.status}):`, errorText);
    throw new Error(`Failed to apply adapt changes: ${res.status} ${errorText.substring(0, 200)}`);
  }

  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const tempPath = path.join(os.tmpdir(), `pipeline_adapt_${adaptJobId}_${Date.now()}.docx`);
  await fs.writeFile(tempPath, buffer);

  return tempPath;
}

/**
 * Save intermediate document to Storage and database
 */
async function saveIntermediateDocument(
  pipelineJobId: string,
  operation: string,
  operationIndex: number,
  documentPath: string,
  operationResult: any
): Promise<void> {
  try {
    // Read document
    const fileBuffer = await fs.readFile(documentPath);
    const fileSize = fileBuffer.length;

    // Upload to Storage
    const storagePath = `${pipelineJobId}/${operationIndex}_${operation}_${Date.now()}.docx`;

    const { error: uploadError } = await supabase.storage
      .from('pipeline-outputs')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true
      });

    if (uploadError) {
      console.error(`[PIPELINE-APPROVE] Failed to upload intermediate document:`, uploadError);
      throw new Error(`Failed to upload: ${uploadError.message}`);
    }

    // Save to database
    const { error: insertError } = await supabase
      .from('pipeline_intermediate_documents')
      .insert({
        pipeline_job_id: pipelineJobId,
        operation_name: operation,
        operation_index: operationIndex,
        storage_path: storagePath,
        file_size_bytes: fileSize,
        operation_job_id: operationResult.operationJobId,
        metadata: {
          ...operationResult.metadata,
          approvedItems: operationResult.approvedItems,
          appliedAt: new Date().toISOString()
        }
      });

    if (insertError) {
      console.error(`[PIPELINE-APPROVE] Failed to save intermediate document record:`, insertError);
      throw new Error(`Failed to save record: ${insertError.message}`);
    }

    console.log(`[PIPELINE-APPROVE] Saved intermediate document: ${storagePath}`);

  } catch (error: any) {
    console.error(`[PIPELINE-APPROVE] Error saving intermediate document:`, error);
    throw error; // Re-throw to handle in caller
  }
}
