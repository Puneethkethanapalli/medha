import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View, type GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, CornerDownLeft, Info } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import {
  parseAskUserChoiceToolCall,
  type AskUserChoiceQuestion,
  type AskUserChoiceSubmission,
} from '@/lib/tools/ask-user-choice';
import type { Message } from '@/types';

interface ChoiceCardProps {
  message: Message;
  onSubmit?: (messageId: string, submission: AskUserChoiceSubmission) => void;
  onDismiss?: (messageId: string) => void;
}

interface QuestionSelection {
  labels: string[];
  otherSelected: boolean;
  otherText: string;
}

type SelectionState = Record<string, QuestionSelection>;
const EMPTY_QUESTIONS: AskUserChoiceQuestion[] = [];

export function ChoiceCard({ message, onSubmit, onDismiss }: ChoiceCardProps) {
  const pendingChoice = useMemo(
    () => parseAskUserChoiceToolCall(message.tool_calls),
    [message.tool_calls]
  );
  const questions = pendingChoice?.request.questions ?? EMPTY_QUESTIONS;
  const [selections, setSelections] = useState<SelectionState>(() =>
    buildInitialSelections(questions)
  );
  const [expandedDescription, setExpandedDescription] = useState<string | null>(null);

  useEffect(() => {
    setSelections(buildInitialSelections(questions));
    setExpandedDescription(null);
  }, [questions]);

  const toggleOption = useCallback((question: AskUserChoiceQuestion, questionIndex: number, label: string) => {
    const key = getQuestionKey(question, questionIndex);
    Haptics.selectionAsync().catch(() => undefined);
    setSelections((current) => {
      const existing = current[key] ?? createEmptySelection();
      const labels = question.multiSelect
        ? toggleLabel(existing.labels, label)
        : [label];

      return {
        ...current,
        [key]: {
          ...existing,
          labels,
          otherSelected: question.multiSelect ? existing.otherSelected : false,
        },
      };
    });
  }, []);

  const toggleOther = useCallback((question: AskUserChoiceQuestion, questionIndex: number) => {
    const key = getQuestionKey(question, questionIndex);
    Haptics.selectionAsync().catch(() => undefined);
    setSelections((current) => {
      const existing = current[key] ?? createEmptySelection();
      const nextOtherSelected = !existing.otherSelected;

      return {
        ...current,
        [key]: {
          ...existing,
          labels: question.multiSelect ? existing.labels : [],
          otherSelected: nextOtherSelected,
        },
      };
    });
  }, []);

  const setOtherText = useCallback((question: AskUserChoiceQuestion, questionIndex: number, text: string) => {
    const key = getQuestionKey(question, questionIndex);
    setSelections((current) => {
      const existing = current[key] ?? createEmptySelection();
      return {
        ...current,
        [key]: {
          ...existing,
          otherSelected: true,
          labels: question.multiSelect ? existing.labels : [],
          otherText: text,
        },
      };
    });
  }, []);

  const answers = useMemo(() => buildAnswers(questions, selections), [questions, selections]);
  const canSubmit = questions.length > 0
    && Object.keys(answers).length === questions.length
    && !!onSubmit;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onSubmit?.(message.id, { answers });
  }, [answers, canSubmit, message.id, onSubmit]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onDismiss?.(message.id);
  }, [message.id, onDismiss]);

  const toggleDescription = useCallback((key: string, event: GestureResponderEvent) => {
    event.stopPropagation();
    Haptics.selectionAsync().catch(() => undefined);
    setExpandedDescription((current) => (current === key ? null : key));
  }, []);

  if (!pendingChoice || questions.length === 0) return null;

  return (
    <View className="mt-3 w-full rounded-2xl border border-outline-variant/30 bg-[#1A1A1C] p-3">
      {questions.map((question, questionIndex) => {
        const questionKey = getQuestionKey(question, questionIndex);
        const selection = selections[questionKey] ?? createEmptySelection();
        const isMultiQuestion = questions.length > 1;

        return (
          <View key={questionKey} className={questionIndex > 0 ? 'mt-4' : ''}>
            {isMultiQuestion && (
              <Text className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">
                {question.header}
              </Text>
            )}
            <Text className="mb-3 text-[17px] font-medium leading-6 text-foreground">
              {question.question}
            </Text>

            <View className="gap-1">
              {question.options.map((option, optionIndex) => {
                const optionKey = `${questionKey}:${option.label}`;
                const selected = selection.labels.includes(option.label);
                const descriptionExpanded = expandedDescription === optionKey;
                const displayLabel = option.recommended && !/\brecommended\b/i.test(option.label)
                  ? `${option.label} (Recommended)`
                  : option.label;

                return (
                  <View key={optionKey}>
                    <Pressable
                      onPress={() => toggleOption(question, questionIndex, option.label)}
                      className={`min-h-11 flex-row items-center rounded-xl px-3 py-2 ${
                        selected ? 'bg-[#252527]' : 'bg-transparent'
                      }`}
                    >
                      <Text className="w-7 text-[14px] text-muted-foreground">
                        {optionIndex + 1}.
                      </Text>
                      <Text
                        className={`flex-1 text-[14px] leading-5 ${
                          selected ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                        numberOfLines={2}
                      >
                        {displayLabel}
                      </Text>
                      {option.description ? (
                        <Pressable
                          accessibilityLabel={`Show description for ${option.label}`}
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={(event) => toggleDescription(optionKey, event)}
                          className="h-7 w-7 items-center justify-center rounded-full"
                        >
                          <Info size={14} color="hsl(0, 0%, 63%)" />
                        </Pressable>
                      ) : null}
                      {selected && (
                        <View className="ml-1 h-6 w-6 items-center justify-center rounded-full bg-[#343438]">
                          <Check size={14} color="hsl(0, 0%, 88%)" strokeWidth={2.4} />
                        </View>
                      )}
                    </Pressable>
                    {descriptionExpanded && option.description ? (
                      <View className="mx-3 mb-1 rounded-lg bg-[#111113] px-3 py-2">
                        <Text className="text-[12px] leading-5 text-muted-foreground">
                          {option.description}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <View>
                <Pressable
                  onPress={() => toggleOther(question, questionIndex)}
                  className={`min-h-11 flex-row items-center rounded-xl px-3 py-2 ${
                    selection.otherSelected ? 'bg-[#252527]' : 'bg-transparent'
                  }`}
                >
                  <Text className="w-7 text-[14px] text-muted-foreground">
                    {question.options.length + 1}.
                  </Text>
                  <Text
                    className={`flex-1 text-[14px] leading-5 ${
                      selection.otherSelected ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                    numberOfLines={1}
                  >
                    Other...
                  </Text>
                  {selection.otherSelected && (
                    <View className="ml-1 h-6 w-6 items-center justify-center rounded-full bg-[#343438]">
                      <Check size={14} color="hsl(0, 0%, 88%)" strokeWidth={2.4} />
                    </View>
                  )}
                </Pressable>
                {selection.otherSelected && (
                  <View className="mx-3 mb-1 rounded-lg border border-outline-variant/20 bg-[#111113] px-3 py-2">
                    <TextInput
                      value={selection.otherText}
                      onChangeText={(text) => setOtherText(question, questionIndex, text)}
                      placeholder="Type your answer"
                      placeholderTextColor="hsl(0, 0%, 44%)"
                      className="text-[14px] text-foreground"
                      multiline
                      style={{ minHeight: 28, padding: 0 }}
                    />
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })}

      <View className="mt-4 flex-row items-center justify-end gap-2">
        <Pressable
          onPress={handleDismiss}
          className="h-9 items-center justify-center rounded-full px-3 active:opacity-70"
        >
          <Text className="text-[14px] font-medium text-muted-foreground">Dismiss</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className={`h-9 flex-row items-center justify-center gap-2 rounded-full px-4 ${
            canSubmit ? 'bg-[#56B7E8]' : 'bg-[#2A2A2D]'
          }`}
        >
          <Text className={`text-[14px] font-semibold ${canSubmit ? 'text-[#071014]' : 'text-muted-foreground'}`}>
            Submit
          </Text>
          <View className={`h-6 w-6 items-center justify-center rounded-full ${canSubmit ? 'bg-black/10' : 'bg-transparent'}`}>
            <CornerDownLeft size={14} color={canSubmit ? '#071014' : 'hsl(0, 0%, 44%)'} strokeWidth={2.4} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function buildInitialSelections(questions: AskUserChoiceQuestion[]): SelectionState {
  const initial: SelectionState = {};

  questions.forEach((question, index) => {
    const recommendedOptions = question.options.filter((option) => option.recommended);
    const fallbackOption = question.multiSelect ? null : question.options[0];
    const labels = question.multiSelect
      ? recommendedOptions.map((option) => option.label)
      : [recommendedOptions[0]?.label ?? fallbackOption?.label].filter(Boolean) as string[];

    initial[getQuestionKey(question, index)] = {
      labels,
      otherSelected: false,
      otherText: '',
    };
  });

  return initial;
}

function buildAnswers(
  questions: AskUserChoiceQuestion[],
  selections: SelectionState
): Record<string, string> {
  const answers: Record<string, string> = {};

  questions.forEach((question, index) => {
    const selection = selections[getQuestionKey(question, index)] ?? createEmptySelection();
    const parts = [...selection.labels];
    const otherText = selection.otherText.trim();
    if (selection.otherSelected && otherText) {
      parts.push(otherText);
    }

    const answer = parts.join(', ').trim();
    if (answer) {
      answers[question.question] = answer;
    }
  });

  return answers;
}

function getQuestionKey(question: AskUserChoiceQuestion, index: number): string {
  return `${index}:${question.question}`;
}

function createEmptySelection(): QuestionSelection {
  return {
    labels: [],
    otherSelected: false,
    otherText: '',
  };
}

function toggleLabel(labels: string[], label: string): string[] {
  return labels.includes(label)
    ? labels.filter((item) => item !== label)
    : [...labels, label];
}
