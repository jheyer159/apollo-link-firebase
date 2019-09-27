import { ExecInfo, Resolver } from 'graphql-anywhere';
import * as has from 'lodash/has';
import * as last from 'lodash/last';
import { MutationResolverContext, MutationResolverRoot } from './types';

const resolver: Resolver = async (
  fieldName: string,
  root: MutationResolverRoot,
  args: any,
  context: MutationResolverContext,
  info: ExecInfo
) => {
  const { resultKey, directives, isLeaf } = info;
  const { database } = context;
  const hasTypeDirective = has(directives, 'type');

  // used when rtdbPush need to know the generated pushKey
  // also fields return in @rtdbPush payload
  if (isLeaf && has(directives, 'pushKey')) {
    return root.__pushKey;
  }

  // slice key from ref
  if (isLeaf && has(directives, 'key')) {
    const { mutationRef } = context;
    const key = last(mutationRef.split('/'));
    return key || null;
  }

  // __typename
  if (isLeaf && resultKey === '__typename') {
    return hasTypeDirective
      ? directives.type.name
      : root.__typename || null;
  }

  // @rtdbUpdate, @rtdbSet, we simply return the input to make apollo cache work
  if (isLeaf && root && has(root, 'payload')) {
    return (root.payload && root.payload[resultKey]) || null;
  }

  // By convention GraphQL recommends mutations having a single argument named 'input'
  // https://dev-blog.apollodata.com/designing-graphql-mutations-e09de826ed97
  const payload: any = args && args.input;
  // deal with @rtdbUpdate, @rtdbSet, @rtdbRemove
  const typeTagName: string = hasTypeDirective
    ? directives.type.name
    : null;
  if (has(directives, 'rtdbUpdate')) {
    const {ref, type} = directives.rtdbUpdate;
    context.mutationRef = ref;
    await database.ref(ref).update(payload);
    return {payload, __typename: typeTagName || type};
  } else if (has(directives, 'rtdbSet')) {
    const {ref, type} = directives.rtdbSet;
    context.mutationRef = ref;
    await database.ref(ref).set(payload);
    return {payload, __typename: typeTagName || type};
  } else if (has(directives, 'rtdbRemove')) {
    const {ref} = directives.rtdbRemove;
    context.mutationRef = ref;
    await database.ref(ref).remove();
    return {payload: null};
  } else if (has(directives, 'rtdbPush')) {
    const {ref, type} = directives.rtdbPush;
    context.mutationRef = ref;
    const newRef = database.ref(ref).push();
    await newRef.set(payload);
    return {
      payload,
      __pushKey: newRef.key,
      __typename: typeTagName || type
    };
  } else if (!isLeaf && root && has(root, 'payload') && hasTypeDirective) {
    // if it's a selectionSet with payload and @type
    return {
      payload: (root.payload && root.payload[resultKey]) || null,
      __typename: directives.type.name
    };
  }

  return payload;
};

export default resolver;
