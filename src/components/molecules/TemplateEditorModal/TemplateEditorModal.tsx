import React, { useState, useEffect } from 'react';
import { Modal } from 'antd';
import { Input } from '../../atoms/Input/Input';
import { Textarea } from '../../atoms/Textarea/Textarea';
import { Button } from '../../atoms/Button/Button';
import { FormField } from '../FormField/FormField';
import styles from './TemplateEditorModal.module.css';

interface TemplateEditorModalProps {
  isOpen: boolean;
  mode: 'save' | 'edit';
  initialName?: string;
  initialDescription?: string;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  mode,
  initialName = '',
  initialDescription = '',
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setErrors({});
    }
  }, [isOpen, initialName, initialDescription]);

  const validateForm = (): boolean => {
    const newErrors: { name?: string; description?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Template name is required';
    } else if (name.length < 3) {
      newErrors.name = 'Template name must be at least 3 characters';
    } else if (name.length > 50) {
      newErrors.name = 'Template name must be less than 50 characters';
    }

    if (description && description.length > 200) {
      newErrors.description = 'Description must be less than 200 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave(name.trim(), description.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Modal
      open={isOpen}
      onCancel={onCancel}
      footer={null}
      title={mode === 'save' ? 'Save Template' : 'Edit Template'}
      width={500}
      className={styles.modal}
    >
      <div className={styles.content}>
        <FormField
          label="Template Name"
          helpText="A descriptive name for your template"
          error={errors.name}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Production Network View"
            onKeyPress={handleKeyPress}
            autoFocus
          />
        </FormField>

        <FormField
          label="Description (Optional)"
          helpText="Brief description of when to use this template"
          error={errors.description}
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Optimized for monitoring production networks with focus on active interfaces"
            rows={3}
          />
        </FormField>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {mode === 'save' ? 'Save Template' : 'Update Template'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
