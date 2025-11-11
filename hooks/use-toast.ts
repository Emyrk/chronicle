import { toast } from 'sonner'

export const useToast = () => {
  return {
    toast: (props: {
      title?: string
      description?: string
      variant?: 'default' | 'destructive'
    }) => {
      if (props.variant === 'destructive') {
        toast.error(props.title || 'Error', {
          description: props.description,
        })
      } else {
        toast.success(props.title || 'Success', {
          description: props.description,
        })
      }
    },
  }
}