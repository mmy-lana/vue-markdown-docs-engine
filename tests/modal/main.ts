import { createApp, defineComponent, h, ref } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseKbd from '@/components/ui/BaseKbd.vue';
import '@/style.css';

const Probe = defineComponent({
  components: { BaseModal, BaseButton, BaseInput, BaseTextarea, BaseBadge, BaseKbd },
  setup() {
    const isOpen = ref(false);
    const isSecondOpen = ref(false);
    const hasHiddenButton = ref(true);
    const text = ref('hello');
    const note = ref('');
    const fieldError = ref('A validation message');
    const closeCount = ref(0);
    const clickCount = ref(0);

    return {
      isOpen,
      isSecondOpen,
      hasHiddenButton,
      text,
      note,
      fieldError,
      closeCount,
      clickCount
    };
  },
  render() {
    return h('div', { class: 'min-h-dvh p-6' }, [
      h('div', { id: 'outside-input' }, [
        h('input', { id: 'outside-field', type: 'text', 'data-testid': 'outside-input' })
      ]),
      h(
        'button',
        {
          id: 'launcher',
          'data-testid': 'launcher',
          class: 'min-h-11 min-w-11 border px-4',
          onClick: () => {
            this.isOpen = true;
          }
        },
        'Open dialog'
      ),

      h(BaseModal, {
        isOpen: this.isOpen,
        ariaLabel: 'Probe dialog',
        hideCloseButton: true,
        onClose: () => {
          this.closeCount += 1;
          this.isOpen = false;
        }
      }, {
        default: () => [
          h('h2', { id: 'probe-dialog-title' }, 'Probe dialog'),
          h(
            'button',
            { id: 'first-control', 'data-testid': 'first', class: 'min-h-11 border px-2' },
            'First'
          ),
          this.hasHiddenButton
            ? h(
                'button',
                { id: 'middle-control', 'data-testid': 'middle', class: 'min-h-11 border px-2' },
                'Middle'
              )
            : null,
          h('input', { id: 'last-control', 'data-testid': 'last', type: 'text' }),
          h(
            'button',
            {
              id: 'toggle-hidden',
              'data-testid': 'toggle-hidden',
              class: 'min-h-11 border px-2',
              onClick: () => {
                this.hasHiddenButton = !this.hasHiddenButton;
              }
            },
            'Toggle middle'
          ),
          h(
            'button',
            {
              id: 'open-nested',
              'data-testid': 'open-nested',
              class: 'min-h-11 border px-2',
              onClick: () => {
                this.isSecondOpen = true;
              }
            },
            'Open nested'
          )
        ]
      }),

      h(BaseModal, {
        isOpen: this.isSecondOpen,
        ariaLabel: 'Second dialog',
        hideCloseButton: true,
        onClose: () => {
          this.isSecondOpen = false;
        }
      }, {
        default: () => [h('button', { id: 'second-control', 'data-testid': 'second' }, 'Second')]
      }),

      h('div', { class: 'mt-6 grid gap-4' }, [
        h(BaseInput, {
          id: 'probe-input',
          modelValue: this.text,
          label: 'Probe input',
          hint: 'A hint',
          leadingIcon: 'search',
          'onUpdate:modelValue': (value: string) => {
            this.text = value;
          }
        }),
        h(BaseTextarea, {
          id: 'probe-textarea',
          modelValue: this.note,
          label: 'Probe textarea',
          error: this.fieldError,
          monospace: true,
          rows: 4,
          'onUpdate:modelValue': (value: string) => {
            this.note = value;
          }
        }),
        h(BaseBadge, { tone: 'brand', dot: true }, () => 'Badge'),
        h(BaseKbd, () => '⌘K'),
        h(BaseButton, {
          variant: 'primary',
          loading: true
        }, () => 'Saving'),
        h(BaseButton, {
          id: 'click-target',
          'data-testid': 'click-target',
          onClick: () => {
            this.clickCount += 1;
          }
        }, () => `Clicked ${this.clickCount}`)
      ])
    ]);
  }
});

createApp(Probe).mount('#app');
