/**
 * Pipeline Execution Engine
 * Orchestrates sequential execution of document processing operations
 */

import { supabase } from '@/lib/supabase';
import {
  PipelineJob,
  PipelineOperation,
  PipelineExecutionContext,
  OperationResult,
  OperationConfigs,
  PipelineStatus
} from './types';
import { createTranslationJob, executeTranslation } from '@/lib/translation/run-translation';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// ============================================
// Custom Errors
// ============================================

export class PipelineCancelledException extends Error {
  constructor() {
    super('Pipeline execution was cancelled');
    this.name = 'PipelineCancelledException';
  }
}

export class PipelinePausedException extends Error {
  constructor() {
    super('Pipeline execution is paused');
    this.name = 'PipelinePausedException';
  }
}

// ============================================
// Pipeline Engine Class
// ============================================

export class PipelineEngine {
  private pipelineJobId: string;

  constructor(pipelineJobId: string) {
    this.pipelineJobId = pipelineJobId;
  }

  /**
   * Main execution method - runs the entire pipeline
   */
  async execute(): Promise<void> {
    console.log(`[PIPELINE ${this.pipelineJobId}] Starting execution...`);

    try {
      // Load job from database
      const job = await this.loadJob();

      // Update status to running
      await this.updateStatus('running');
      await this.updateTimestamp('started_at');

      // Get original document path from Storage
      let currentDocumentPath = await this.getOriginalDocumentPath(job.document_id);

      // Execute each operation sequentially
      for (let i = job.current_operation_index; i < job.selected_operations.length; i++) {
        // Check for execution control (pause/cancel)
        await this.checkExecutionControl();

        const operation = job.selected_operations[i];
        const config = job.operation_configs[operation];

        if (!config) {
          throw new Error(`Configuration not found for operation: ${operation}`);
        }

        console.log(`[PIPELINE ${this.pipelineJobId}] Executing operation ${i + 1}/${job.selected_operations.length}: ${operation}`);

        // Update current operation index
        await this.updateCurrentOperation(i);

        // Execute the operation
        const context: PipelineExecutionContext = {
          pipelineJobId: this.pipelineJobId,
          documentId: job.document_id,
          currentOperation: operation,
          currentOperationIndex: i,
          sourceDocumentPath: currentDocumentPath,
          config
        };

        const result = await this.executeOperation(context);

        // Save operation result
        await this.saveOperationResult(result);

        // Update cost
        if (result.metadata.cost_usd) {
          await this.incrementCost(result.metadata.cost_usd);
        }

        // Check if requires approval
        if (result.requiresApproval && result.status === 'awaiting_approval') {
          console.log(`[PIPELINE ${this.pipelineJobId}] ⏸️ Operation ${operation} awaiting approval`);

          // Update pipeline status to awaiting_approval
          await this.updateStatus('awaiting_approval');

          // Stop execution here - wait for user approval
          return;
        }

        // Save intermediate document (only if approved/completed)
        await this.saveIntermediateDocument(
          operation,
          i,
          result.outputDocumentPath,
          result
        );

        // Next operation will use this output as input
        currentDocumentPath = result.outputDocumentPath;

        console.log(`[PIPELINE ${this.pipelineJobId}] ✓ Operation ${operation} completed`);
      }

      // All operations completed - mark as completed
      await this.completePipeline(currentDocumentPath);

      console.log(`[PIPELINE ${this.pipelineJobId}] ✅ Pipeline completed successfully!`);

    } catch (error: any) {
      console.error(`[PIPELINE ${this.pipelineJobId}] ❌ Error:`, error);

      if (error instanceof PipelineCancelledException) {
        // Already marked as cancelled, just exit
        return;
      }

      await this.handleError(error);
      throw error;
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(context: PipelineExecutionContext): Promise<OperationResult> {
    const { currentOperation, config, sourceDocumentPath } = context;

    const startTime = Date.now();

    try {
      let result: OperationResult;

      switch (currentOperation) {
        case 'adjust':
          result = await this.executeAdjust(context);
          break;
        case 'update':
          result = await this.executeUpdate(context);
          break;
        case 'improve':
          result = await this.executeImprove(context);
          break;
        case 'adapt':
          result = await this.executeAdapt(context);
          break;
        case 'translate':
          result = await this.executeTranslate(context);
          break;
        default:
          throw new Error(`Unknown operation: ${currentOperation}`);
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      result.metadata.duration_seconds = duration;

      return result;

    } catch (error: any) {
      const duration = Math.round((Date.now() - startTime) / 1000);

      return {
        operation: currentOperation,
        operationIndex: context.currentOperationIndex,
        status: 'failed',
        outputDocumentPath: sourceDocumentPath, // Keep original on failure
        metadata: {
          duration_seconds: duration,
          error_message: error.message
        },
        completedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Execute ADJUST operation
   */
  private async executeAdjust(context: PipelineExecutionContext): Promise<OperationResult> {
    const { config, sourceDocumentPath, documentId } = context;

    // Call adjust operation directly to avoid self-fetch issues (Railway/Vercel)
    const adjustConfig = config as any;
    
    console.log(`[PIPELINE] Starting adjust operation directly (avoiding self-fetch)`);

    // Import and call the adjust processor directly
    const { analyzeDocumentForAdjustments } = await import('@/lib/adjust/processor');
    const { extractDocumentStructure } = await import('@/lib/improvement/document-analyzer');
    
    // Create adjust job in database
    const adjustJobId = randomUUID();
    const { error: jobError } = await supabase
      .from('adjust_jobs')
      .insert({
        id: adjustJobId,
        document_id: documentId || null,
        status: 'pending',
        instructions: adjustConfig.instructions,
        creativity: adjustConfig.creativity,
        use_grounding: adjustConfig.useGrounding || false,
        provider: adjustConfig.provider,
        model: adjustConfig.model
      });

    if (jobError) {
      throw new Error(`Failed to create adjust job: ${jobError.message}`);
    }

    console.log(`[PIPELINE] Adjust job created: ${adjustJobId}`);

    // Update status to adjusting
    await supabase
      .from('adjust_jobs')
      .update({ status: 'adjusting', started_at: new Date().toISOString() })
      .eq('id', adjustJobId);

    // Extract document structure
    const { structure, paragraphs } = await extractDocumentStructure(sourceDocumentPath);

    // Update job with structure
    await supabase
      .from('adjust_jobs')
      .update({
        document_structure: structure,
        total_sections: structure.sections.length
      })
      .eq('id', adjustJobId);

    // Get API key
    const apiKey =
      adjustConfig.provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : adjustConfig.provider === 'gemini'
          ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!
          : adjustConfig.provider === 'anthropic'
            ? process.env.ANTHROPIC_API_KEY!
            : process.env.GROK_API_KEY!;

    try {
      // Generate adjustment suggestions directly
      const suggestions = await analyzeDocumentForAdjustments(
        sourceDocumentPath,
        adjustConfig.instructions,
        adjustConfig.creativity,
        adjustConfig.provider,
        adjustConfig.model,
        apiKey,
        adjustConfig.useGrounding || false
      );

      console.log(`[PIPELINE] Generated ${suggestions.length} adjustment suggestions`);

      // Save suggestions to database
      await supabase
        .from('adjust_jobs')
        .update({
          status: 'completed',
          suggestions: suggestions,
          completed_at: new Date().toISOString()
        })
        .eq('id', adjustJobId);

    } catch (error: any) {
      console.error(`[PIPELINE] Error in adjust operation:`, error);
      await supabase
        .from('adjust_jobs')
        .update({
          status: 'error',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', adjustJobId);
      throw error;
    }

    // Get results
    const adjustJob = await this.getAdjustJob(adjustJobId);

    return {
      operation: 'adjust',
      operationIndex: context.currentOperationIndex,
      status: 'awaiting_approval',
      outputDocumentPath: sourceDocumentPath, // Keep original until approved
      operationJobId: adjustJobId,
      requiresApproval: true,
      approvalStatus: 'pending',
      metadata: {
        items_generated: adjustJob.suggestions?.length || 0,
        instructions: adjustConfig.instructions,
        creativity: adjustConfig.creativity
      },
      completedAt: new Date().toISOString()
    };
  }

  /**
   * Execute UPDATE (norms) operation
   */
  private async executeUpdate(context: PipelineExecutionContext): Promise<OperationResult> {
    const { config, sourceDocumentPath, documentId } = context;

    // Call norms-update operation directly (LexML/Senado first, then IA)
    const updateConfig = config as any;
    
    console.log(`[PIPELINE] Starting norms-update (official sources + IA)...`);

    const { extractDocumentStructure } = await import('@/lib/improvement/document-analyzer');
    const { detectNormsInDocument } = await import('@/lib/norms-update/norm-detector');
    const { verifyMultipleNorms } = await import('@/lib/norms-update/norm-verifier');
    
    // Create norms-update job in database
    const updateJobId = randomUUID();
    const { error: jobError } = await supabase
      .from('norm_update_jobs')
      .insert({
        id: updateJobId,
        document_id: documentId || null,
        status: 'pending',
        norm_references: [],
        total_references: 0,
        vigentes: 0,
        alteradas: 0,
        revogadas: 0,
        substituidas: 0,
        manual_review: 0,
        current_reference: 0,
        progress_percentage: 0
      });

    if (jobError) {
      throw new Error(`Failed to create norms-update job: ${jobError.message}`);
    }

    console.log(`[PIPELINE] Norms-update job created: ${updateJobId}`);

    // Update status to analyzing
    await supabase
      .from('norm_update_jobs')
      .update({ status: 'analyzing', started_at: new Date().toISOString() })
      .eq('id', updateJobId);

    // Extract document structure
    const { structure, paragraphs } = await extractDocumentStructure(sourceDocumentPath);

    // Prepare paragraphs with context
    const paragraphsWithContext = paragraphs
      .filter(p => !p.isHeader)
      .map((p, idx) => ({
        text: p.text,
        index: p.index,
        chapterTitle: structure.sections.find((s: any) =>
          p.index >= s.startParagraphIndex &&
          p.index <= s.endParagraphIndex &&
          s.level === 1
        )?.title
      }));

    // Get API key
    const apiKey =
      updateConfig.provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : updateConfig.provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY!
          : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;

    try {
      // Detect norms in document
      let references = await detectNormsInDocument(
        paragraphsWithContext,
        updateConfig.provider,
        updateConfig.model,
        apiKey
      );

      console.log(`[PIPELINE] Found ${references.length} norm references`);

      // Update job with references found
      await supabase
        .from('norm_update_jobs')
        .update({
          total_references: references.length,
          progress_percentage: 10
        })
        .eq('id', updateJobId);

      if (references.length === 0) {
        // No norms found
        await supabase
          .from('norm_update_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            progress_percentage: 100
          })
          .eq('id', updateJobId);
      } else {
        // Verify norm statuses
        const verifiedReferences = await verifyMultipleNorms(
          references,
          updateConfig.provider,
          updateConfig.model,
          apiKey,
          undefined, // Gemini doesn't need external web search function
          async (current: number, total: number) => {
            const percentage = 10 + Math.floor((current / total) * 90);
            await supabase
              .from('norm_update_jobs')
              .update({
                current_reference: current,
                progress_percentage: percentage
              })
              .eq('id', updateJobId);
          }
        );

        // Calculate statistics
        const stats = {
          vigentes: verifiedReferences.filter((r: any) => r.status === 'vigente').length,
          alteradas: verifiedReferences.filter((r: any) => r.status === 'alterada').length,
          revogadas: verifiedReferences.filter((r: any) => r.status === 'revogada').length,
          substituidas: verifiedReferences.filter((r: any) => r.status === 'substituida').length,
          manual_review: verifiedReferences.filter((r: any) => r.updateType === 'manual').length
        };

        // Save final result
        await supabase
          .from('norm_update_jobs')
          .update({
            status: 'completed',
            norm_references: verifiedReferences,
            vigentes: stats.vigentes,
            alteradas: stats.alteradas,
            revogadas: stats.revogadas,
            substituidas: stats.substituidas,
            manual_review: stats.manual_review,
            progress_percentage: 100,
            completed_at: new Date().toISOString()
          })
          .eq('id', updateJobId);
      }

    } catch (error: any) {
      console.error(`[PIPELINE] Error in norms-update operation:`, error);
      await supabase
        .from('norm_update_jobs')
        .update({
          status: 'error',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', updateJobId);
      throw error;
    }

    // Get results
    const updateJob = await this.getNormsUpdateJob(updateJobId);

    return {
      operation: 'update',
      operationIndex: context.currentOperationIndex,
      status: 'awaiting_approval',
      outputDocumentPath: sourceDocumentPath, // Keep original until approved
      operationJobId: updateJobId,
      requiresApproval: true,
      approvalStatus: 'pending',
      metadata: {
        items_generated: updateJob.norm_references?.length || 0
      },
      completedAt: new Date().toISOString()
    };
  }

  /**
   * Execute IMPROVE operation
   */
  private async executeImprove(context: PipelineExecutionContext): Promise<OperationResult> {
    const { config, sourceDocumentPath, documentId } = context;

    // Call improve operation directly to avoid self-fetch issues (Railway/Vercel)
    const improveConfig = config as any;
    
    console.log(`[PIPELINE] Starting improve operation directly (avoiding self-fetch)`);

    // Import and call the improve processor directly
    const { extractDocumentStructure, generateGlobalContext } = await import('@/lib/improvement/document-analyzer');
    const { analyzeSectionForImprovements } = await import('@/lib/improvement/section-analyzer');
    
    // Create improve job in database
    const improveJobId = randomUUID();
    const { error: jobError } = await supabase
      .from('improvement_jobs')
      .insert({
        id: improveJobId,
        document_id: documentId || null,
        status: 'pending'
      });

    if (jobError) {
      throw new Error(`Failed to create improve job: ${jobError.message}`);
    }

    console.log(`[PIPELINE] Improve job created: ${improveJobId}`);

    // Update status to analyzing
    await supabase
      .from('improvement_jobs')
      .update({ status: 'analyzing', started_at: new Date().toISOString() })
      .eq('id', improveJobId);

    // Extract document structure
    const { structure, paragraphs } = await extractDocumentStructure(sourceDocumentPath);

    // Get API key
    const apiKey =
      improveConfig.provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : improveConfig.provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY!
          : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;

    // Generate global context
    const globalContext = await generateGlobalContext(
      paragraphs,
      structure,
      improveConfig.provider,
      improveConfig.model,
      apiKey
    );

    // Update job with structure and context
    await supabase
      .from('improvement_jobs')
      .update({
        global_context: globalContext,
        document_structure: structure,
        total_sections: structure.sections.length
      })
      .eq('id', improveJobId);

    try {
      // Analyze each section
      const allSuggestions: any[] = [];
      const BATCH_SIZE = 20;

      for (let i = 0; i < structure.sections.length; i++) {
        const section = structure.sections[i];
        const sectionParagraphs = paragraphs
          .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
          .filter(p => !p.isHeader)
          .map(p => p.text);

        if (sectionParagraphs.length > BATCH_SIZE) {
          for (let batchStart = 0; batchStart < sectionParagraphs.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, sectionParagraphs.length);
            const batch = sectionParagraphs.slice(batchStart, batchEnd);

            const suggestions = await analyzeSectionForImprovements(
              batch,
              globalContext,
              section.title,
              section.startParagraphIndex + batchStart,
              improveConfig.provider,
              improveConfig.model,
              apiKey
            );

            allSuggestions.push(...suggestions);
          }
        } else {
          const suggestions = await analyzeSectionForImprovements(
            sectionParagraphs,
            globalContext,
            section.title,
            section.startParagraphIndex,
            improveConfig.provider,
            improveConfig.model,
            apiKey
          );

          allSuggestions.push(...suggestions);
        }

        // Update progress
        const percentage = Math.round(((i + 1) / structure.sections.length) * 100);
        await supabase
          .from('improvement_jobs')
          .update({
            current_section: i + 1,
            progress_percentage: percentage
          })
          .eq('id', improveJobId);
      }

      // Save suggestions to database
      await supabase
        .from('improvement_jobs')
        .update({
          status: 'completed',
          suggestions: allSuggestions,
          completed_at: new Date().toISOString()
        })
        .eq('id', improveJobId);

      console.log(`[PIPELINE] Generated ${allSuggestions.length} improvement suggestions`);

    } catch (error: any) {
      console.error(`[PIPELINE] Error in improve operation:`, error);
      await supabase
        .from('improvement_jobs')
        .update({
          status: 'error',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', improveJobId);
      throw error;
    }

    // Get results
    const improveJob = await this.getImproveJob(improveJobId);

    return {
      operation: 'improve',
      operationIndex: context.currentOperationIndex,
      status: 'awaiting_approval',
      outputDocumentPath: sourceDocumentPath, // Keep original until approved
      operationJobId: improveJobId,
      requiresApproval: true,
      approvalStatus: 'pending',
      metadata: {
        items_generated: improveJob.suggestions?.length || 0
      },
      completedAt: new Date().toISOString()
    };
  }

  /**
   * Execute ADAPT operation
   */
  private async executeAdapt(context: PipelineExecutionContext): Promise<OperationResult> {
    const { config, sourceDocumentPath, documentId } = context;

    // Call adapt operation directly to avoid self-fetch issues (Railway/Vercel)
    const adaptConfig = config as any;
    
    console.log(`[PIPELINE] Starting adapt operation directly (avoiding self-fetch)`);

    // Import and call the adapt processor directly
    const { analyzeDocumentForAdaptation } = await import('@/lib/adapt/processor');
    const { extractDocumentStructure } = await import('@/lib/improvement/document-analyzer');
    
    // Create adapt job in database
    if (!documentId) {
      throw new Error('Document ID is required for adapt operation');
    }

    const adaptJobId = randomUUID();
    const { error: jobError } = await supabase
      .from('adapt_jobs')
      .insert({
        id: adaptJobId,
        document_id: documentId,
        status: 'pending',
        style: adaptConfig.style,
        target_audience: adaptConfig.targetAudience || null,
        provider: adaptConfig.provider,
        model: adaptConfig.model,
        current_section: 0,
        total_sections: 0,
        progress_percentage: 0
      });

    if (jobError) {
      throw new Error(`Failed to create adapt job: ${jobError.message}`);
    }

    console.log(`[PIPELINE] Adapt job created: ${adaptJobId}`);

    // Update status to adapting
    await supabase
      .from('adapt_jobs')
      .update({ status: 'adapting', started_at: new Date().toISOString() })
      .eq('id', adaptJobId);

    // Extract document structure
    console.log(`[PIPELINE ADAPT ${adaptJobId}] Extracting document structure...`);
    const { structure, paragraphs } = await extractDocumentStructure(sourceDocumentPath);
    console.log(`[PIPELINE ADAPT ${adaptJobId}] Extracted ${paragraphs.length} paragraphs, ${structure.sections.length} sections`);

    // Update job with structure
    await supabase
      .from('adapt_jobs')
      .update({
        document_structure: structure,
        total_sections: structure.sections.length,
        current_section: 0,
        progress_percentage: 0
      })
      .eq('id', adaptJobId);

    // Get API key
    const apiKey =
      adaptConfig.provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : adaptConfig.provider === 'gemini'
          ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!
          : adaptConfig.provider === 'anthropic'
            ? process.env.ANTHROPIC_API_KEY!
            : process.env.GROK_API_KEY!;

    console.log(`[PIPELINE ADAPT ${adaptJobId}] Starting adaptation analysis with provider: ${adaptConfig.provider}, model: ${adaptConfig.model}`);

    try {
      // Generate adaptation suggestions directly with progress tracking
      const suggestions = await analyzeDocumentForAdaptation(
        sourceDocumentPath,
        adaptConfig.style,
        adaptConfig.targetAudience,
        adaptConfig.provider,
        adaptConfig.model,
        apiKey,
        async (currentSection: number, totalSections: number, currentBatch?: number, totalBatches?: number) => {
          // Calculate progress correctly:
          // - Completed sections: (currentSection - 1) / totalSections * 100
          // - Current section progress: (currentBatch / totalBatches) / totalSections * 100
          // - Total: sum of both
          let progress = 0;
          
          if (currentSection > 0 && totalSections > 0) {
            // Progress from completed sections (0 to currentSection - 1)
            const completedSectionsProgress = ((currentSection - 1) / totalSections) * 100;
            
            // Progress from current section (if processing batches)
            let currentSectionProgress = 0;
            if (currentBatch && totalBatches && totalBatches > 0) {
              currentSectionProgress = (currentBatch / totalBatches) * (100 / totalSections);
            } else if (currentSection === totalSections && !currentBatch) {
              // Section completed but no batch info
              currentSectionProgress = (100 / totalSections);
            }
            
            progress = Math.min(Math.round(completedSectionsProgress + currentSectionProgress), 100);
          }
          
          console.log(`[PIPELINE ADAPT ${adaptJobId}] Progress: Section ${currentSection}/${totalSections}${currentBatch && totalBatches ? `, Batch ${currentBatch}/${totalBatches}` : ''} (${progress}%)`);
          
          await supabase
            .from('adapt_jobs')
            .update({
              current_section: currentSection,
              progress_percentage: progress
            })
            .eq('id', adaptJobId);
        },
        async (partialSuggestions: any[], currentSection: number, totalSections: number) => {
          // Save partial progress when retry is needed
          console.log(`[PIPELINE ADAPT ${adaptJobId}] 💾 Salvando progresso parcial: ${partialSuggestions.length} sugestões (Seção ${currentSection}/${totalSections})`);
          
          const progress = totalSections > 0 ? Math.round((currentSection / totalSections) * 100) : 0;
          
          await supabase
            .from('adapt_jobs')
            .update({
              suggestions: partialSuggestions,
              current_section: currentSection,
              progress_percentage: progress,
              status: 'adapting' // Keep as adapting during retry
            })
            .eq('id', adaptJobId);
          
          console.log(`[PIPELINE ADAPT ${adaptJobId}] ✅ Progresso parcial salvo: ${partialSuggestions.length} sugestões, ${progress}% completo`);
        }
      );

      console.log(`[PIPELINE ADAPT ${adaptJobId}] ✅ Generated ${suggestions.length} adaptation suggestions`);

      // Save suggestions to database
      console.log(`[PIPELINE ADAPT ${adaptJobId}] Saving ${suggestions.length} suggestions to database...`);
      const { error: updateError } = await supabase
        .from('adapt_jobs')
        .update({
          status: 'completed',
          suggestions: suggestions,
          completed_at: new Date().toISOString(),
          progress_percentage: 100
        })
        .eq('id', adaptJobId);

      if (updateError) {
        console.error(`[PIPELINE ADAPT ${adaptJobId}] Error updating adapt_jobs:`, updateError);
        throw new Error(`Failed to save suggestions: ${updateError.message}`);
      }

      console.log(`[PIPELINE ADAPT ${adaptJobId}] ✅ Adapt operation completed successfully`);

      // Get results (with retry in case of timing issues)
      let adaptJob;
      let retries = 3;
      while (retries > 0) {
        try {
          adaptJob = await this.getAdaptJob(adaptJobId);
          if (adaptJob && adaptJob.suggestions) {
            break;
          }
        } catch (error: any) {
          console.warn(`[PIPELINE ADAPT ${adaptJobId}] Retry getting adapt job (${retries} retries left):`, error.message);
          retries--;
          if (retries > 0) {
            await this.sleep(500); // Wait 500ms before retry
          } else {
            // Use suggestions directly if we can't fetch the job
            adaptJob = { suggestions: suggestions };
          }
        }
      }

      return {
        operation: 'adapt',
        operationIndex: context.currentOperationIndex,
        status: 'awaiting_approval',
        outputDocumentPath: sourceDocumentPath, // Keep original until approved
        operationJobId: adaptJobId,
        requiresApproval: true,
        approvalStatus: 'pending',
        metadata: {
          items_generated: adaptJob?.suggestions?.length || suggestions.length || 0,
          style: adaptConfig.style,
          targetAudience: adaptConfig.targetAudience
        },
        completedAt: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`[PIPELINE ADAPT ${adaptJobId}] Error in adapt operation:`, error);
      console.error(`[PIPELINE ADAPT ${adaptJobId}] Error stack:`, error.stack);
      
      // Update job status to error
      try {
        await supabase
          .from('adapt_jobs')
          .update({
            status: 'error',
            error_message: error.message || 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('id', adaptJobId);
      } catch (updateError: any) {
        console.error(`[PIPELINE ADAPT ${adaptJobId}] Failed to update error status:`, updateError);
      }
      
      throw error;
    }
  }

  /**
   * Execute TRANSLATE operation (in-process, no HTTP fetch)
   */
  private async executeTranslate(context: PipelineExecutionContext): Promise<OperationResult> {
    const { config, sourceDocumentPath, documentId } = context;

    const translateConfig = config as any;

    // Load document row for output path and metadata
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const translateJobId = await createTranslationJob(documentId, {
      documentId,
      targetLanguage: translateConfig.targetLanguage,
      sourceLanguage: translateConfig.sourceLanguage,
      provider: translateConfig.provider,
      model: translateConfig.model,
      maxPages: translateConfig.maxPages,
      sourceDocumentPath
    });
    console.log(`[PIPELINE] Translate job created: ${translateJobId}`);

    // Run translation in-process (no fetch)
    await executeTranslation(translateJobId, documentId, doc, {
      documentId,
      targetLanguage: translateConfig.targetLanguage,
      sourceLanguage: translateConfig.sourceLanguage,
      provider: translateConfig.provider,
      model: translateConfig.model,
      maxPages: translateConfig.maxPages,
      sourceDocumentPath
    });

    const translationJob = await this.getTranslationJob(translateJobId);

    if (!translationJob.output_path) {
      throw new Error('Translation job completed without output_path');
    }

    // Download translated document from Storage to a temp path
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('translations')
      .download(translationJob.output_path);

    if (downloadError || !fileBlob) {
      console.error('[PIPELINE] Failed to download translated document:', downloadError);
      throw new Error(`Failed to download translated document: ${downloadError?.message || 'Unknown error'}`);
    }

    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `pipeline_${this.pipelineJobId}_translate_${Date.now()}.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    // Translation is complete - document is saved to temp path
    // The saveIntermediateDocument method will be called automatically by the pipeline executor
    // to upload it to pipeline-outputs storage and save metadata
    return {
      operation: 'translate',
      operationIndex: context.currentOperationIndex,
      status: 'completed',
      outputDocumentPath: tempPath,
      operationJobId: translateJobId,
      metadata: {
        items_processed: translationJob.total_chunks || 0,
        progress_percentage: translationJob.progress_percentage || 0,
        output_path: translationJob.output_path,
        target_language: translateConfig.targetLanguage,
        source_language: translateConfig.sourceLanguage
      },
      completedAt: new Date().toISOString()
    };
  }

  /**
   * Check if pipeline should pause or cancel
   */
  private async checkExecutionControl(): Promise<void> {
    const job = await this.loadJob();

    if (job.status === 'cancelled') {
      throw new PipelineCancelledException();
    }

    // Wait while paused
    while (job.status === 'paused') {
      console.log(`[PIPELINE ${this.pipelineJobId}] ⏸️ Paused, waiting...`);
      await this.sleep(2000);
      const updatedJob = await this.loadJob();
      if (updatedJob.status !== 'paused') {
        break;
      }
    }
  }

  /**
   * Get original document path from Storage
   */
  private async getOriginalDocumentPath(documentId: string): Promise<string> {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single();

    if (error || !doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Download from Storage to temp path
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download document: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `pipeline_${this.pipelineJobId}_original.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    return tempPath;
  }

  /**
   * Save intermediate document to Storage and database
   */
  private async saveIntermediateDocument(
    operation: PipelineOperation,
    operationIndex: number,
    documentPath: string,
    result: OperationResult
  ): Promise<void> {
    try {
      // Read document
      const fileBuffer = await fs.readFile(documentPath);
      const fileSize = fileBuffer.length;

      // Upload to Storage
      const storagePath = `${this.pipelineJobId}/${operationIndex}_${operation}_${Date.now()}.docx`;

      const { error: uploadError } = await supabase.storage
        .from('pipeline-outputs')
        .upload(storagePath, fileBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true
        });

      if (uploadError) {
        console.error(`[PIPELINE] Failed to upload intermediate document:`, uploadError);
        return;
      }

      // Save to database
      await supabase
        .from('pipeline_intermediate_documents')
        .insert({
          pipeline_job_id: this.pipelineJobId,
          operation_name: operation,
          operation_index: operationIndex,
          storage_path: storagePath,
          file_size_bytes: fileSize,
          operation_job_id: result.operationJobId,
          metadata: result.metadata
        });

      console.log(`[PIPELINE ${this.pipelineJobId}] Saved intermediate document: ${storagePath}`);

    } catch (error: any) {
      console.error(`[PIPELINE] Error saving intermediate document:`, error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Save operation result to job
   */
  private async saveOperationResult(result: OperationResult): Promise<void> {
    const job = await this.loadJob();
    const updatedResults = [...job.operation_results, result];

    await supabase
      .from('pipeline_jobs')
      .update({ operation_results: updatedResults })
      .eq('id', this.pipelineJobId);
  }

  /**
   * Mark pipeline as completed
   */
  private async completePipeline(finalDocumentPath: string): Promise<void> {
    const job = await this.loadJob();

    // Calculate total duration
    const startTime = new Date(job.started_at || job.created_at).getTime();
    const endTime = Date.now();
    const totalDuration = Math.round((endTime - startTime) / 1000);

    await supabase
      .from('pipeline_jobs')
      .update({
        status: 'completed',
        final_document_path: finalDocumentPath,
        total_duration_seconds: totalDuration,
        completed_at: new Date().toISOString()
      })
      .eq('id', this.pipelineJobId);
  }

  /**
   * Handle pipeline error
   */
  private async handleError(error: Error): Promise<void> {
    await supabase
      .from('pipeline_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', this.pipelineJobId);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async loadJob(): Promise<PipelineJob> {
    const { data, error } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', this.pipelineJobId)
      .single();

    if (error || !data) {
      throw new Error(`Pipeline job not found: ${this.pipelineJobId}`);
    }

    return data as PipelineJob;
  }

  private async updateStatus(status: PipelineStatus): Promise<void> {
    await supabase
      .from('pipeline_jobs')
      .update({ status })
      .eq('id', this.pipelineJobId);
  }

  private async updateCurrentOperation(index: number): Promise<void> {
    await supabase
      .from('pipeline_jobs')
      .update({ current_operation_index: index })
      .eq('id', this.pipelineJobId);
  }

  private async updateTimestamp(field: 'started_at' | 'completed_at'): Promise<void> {
    await supabase
      .from('pipeline_jobs')
      .update({ [field]: new Date().toISOString() })
      .eq('id', this.pipelineJobId);
  }

  private async incrementCost(cost: number): Promise<void> {
    const job = await this.loadJob();
    const newCost = (job.total_cost_usd || 0) + cost;

    await supabase
      .from('pipeline_jobs')
      .update({ total_cost_usd: newCost })
      .eq('id', this.pipelineJobId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for a sub-job to complete (poll until done)
   * For translate we poll Supabase directly to avoid "fetch failed" when server calls its own URL (e.g. on Railway).
   */
  private async waitForJobCompletion(operation: string, jobId: string): Promise<void> {
    const maxWaitTime = 30 * 60 * 1000; // 30 minutes max
    const pollInterval = 3000; // 3 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const job =
        operation === 'translate'
          ? await this.getTranslationJob(jobId)
          : operation === 'adjust'
          ? await this.getAdjustJob(jobId)
          : operation === 'adapt'
          ? await this.getAdaptJob(jobId)
          : await this.getJobStatus(operation, jobId);

      if (job.status === 'completed') {
        return;
      }

      if (job.status === 'error' || job.status === 'failed') {
        throw new Error(`${operation} job failed: ${job.error_message || 'Unknown error'}`);
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`${operation} job timed out after 30 minutes`);
  }

  /**
   * Get status of a sub-job
   */
  private async getJobStatus(operation: string, jobId: string): Promise<any> {
    let endpoint = '';

    switch (operation) {
      case 'improve':
        endpoint = `/api/improve/${jobId}`;
        break;
      case 'update':
        endpoint = `/api/norms-update/${jobId}`;
        break;
      case 'adjust':
        endpoint = `/api/adjust/${jobId}`;
        break;
      case 'adapt':
        endpoint = `/api/adapt/${jobId}`;
        break;
      case 'translate':
        endpoint = `/api/translate/${jobId}`;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    const apiUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const url = `${apiUrl}${endpoint}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Failed to get ${operation} job status`);
    }

    return await res.json();
  }

  /**
   * Get improve job details
   */
  private async getImproveJob(jobId: string): Promise<any> {
    const { data, error } = await supabase
      .from('improvement_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get improve job');
    }

    return data;
  }

  /**
   * Get norms-update job details
   */
  private async getNormsUpdateJob(jobId: string): Promise<any> {
    const { data, error } = await supabase
      .from('norm_update_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get norms-update job');
    }

    return data;
  }
  
  /**
   * Get adjust job details
   */
  private async getAdjustJob(jobId: string): Promise<any> {
    const { data, error } = await supabase
      .from('adjust_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get adjust job');
    }

    return data;
  }

  /**
   * Get adapt job details
   */
  private async getAdaptJob(jobId: string): Promise<any> {
    const { data, error } = await supabase
      .from('adapt_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get adapt job');
    }

    return data;
  }

  /**
   * Get translation job details
   */
  private async getTranslationJob(jobId: string): Promise<any> {
    const { data, error } = await supabase
      .from('translation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get translation job');
    }

    return data;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Start pipeline execution in background
 */
export async function startPipelineExecution(pipelineJobId: string): Promise<void> {
  const engine = new PipelineEngine(pipelineJobId);

  // Execute in background (don't await)
  engine.execute().catch(error => {
    console.error(`[PIPELINE ${pipelineJobId}] Background execution error:`, error);
  });
}
