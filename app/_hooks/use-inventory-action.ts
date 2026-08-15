"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ViewerError } from "@/app/_domain/errors";
import { queryKeys } from "@/app/_hooks/query-keys";
import { useSession } from "@/app/_providers/session-provider";
import { executeInventoryAction } from "@/app/_services/action-executor.client";
import {
  buildInventoryAction,
  type ActionInput,
  type InventoryActionName,
} from "@/app/_services/inventory-actions";

export function useExecuteInventoryAction() {
  const queryClient = useQueryClient();
  const { authenticationMethod, wallet } = useSession();
  return useMutation({
    mutationFn: async ({
      name,
      objectId,
      input,
    }: {
      name: InventoryActionName;
      objectId: string;
      input: ActionInput;
    }) => {
      if (!authenticationMethod) {
        throw new ViewerError(
          "Your sign-in method is unavailable.",
          "authentication",
          false,
          401,
        );
      }
      return executeInventoryAction(
        buildInventoryAction(name, objectId, input),
        authenticationMethod,
        wallet?.controller.address,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity.all }),
      ]);
    },
  });
}
