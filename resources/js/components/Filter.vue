<template>
    <div v-show="loading || !filter.hideWhenEmpty || availableOptions.length > 0" class="pt-2 pb-3">
        <h3 class="px-3 text-xs uppercase font-bold tracking-wide">
            <span>{{ filter.name }}</span>
        </h3>

        <div class="px-3 py-2">
            <search-input
                :dusk="`${filter.name}-searchable-filter-select`"
                v-model="value"
                :options="filteredOptions"
                trackBy="value"
                ref="searchInput"
                :clearable="true"
                mode="modal"
                class="w-full"
                @input="performSearch"
                @clear="handleClear"
            >
                <div v-if="selectedOption" class="flex items-center">
                    {{ selectedOption.label }}
                </div>

                <template #option="{ option, selected }">
                    <div
                        class="flex items-center text-sm font-semibold leading-5"
                        :class="{ 'text-white': selected }"
                    >
                        {{ option.label }}
                    </div>
                </template>
            </search-input>
        </div>
    </div>
</template>

<script>
import _ from 'lodash'

export default {
    props: {
        resourceName: {
            type: String,
            required: true,
        },
        lens: String,
        debug: false,
        filterKey: {
            type: String,
            required: true,
        },
    },

    data() {
        return {
            options: [],
            loading: false,
            search: '',
            initialized: false,
        }
    },

    mounted() {
        this.loadInitialOptions()
        this.setupDependencyWatchers()
        this.checkAndReloadOptions()

        this.$watch(
            () => this.value,
            (newVal) => {
                if (this.filter.dependentOf?.length && newVal && !this.options.length) {
                    this.debugLog('log', '[SearchableSelect] Recharging because there is value but no options')
                    this.fetchOptions()
                }
            },
            {immediate: true}
        )

        document.addEventListener('click', this.handleClickOutside)
    },

    created() {
        this.loadInitialOptions()
        this.setupDependencyWatchers()
        this.$nextTick(() => {
            this.initialized = true
        })
        document.addEventListener('click', this.handleClickOutside)
    },

    beforeDestroy() {
        document.removeEventListener('click', this.handleClickOutside)
    },

    methods: {
        loadInitialOptions() {
            if (this.filter.options && this.filter.options.length > 0) {
                this.options = [...this.filter.options]
                this.debugLog('log', '[SearchableSelect] Initial options:', this.options.length)
            }
        },

        checkAndReloadOptions() {
            if (this.filter.dependentOf && this.filter.dependentOf.length > 0) {
                const depsFilled = this.filter.dependentOf.every(depName => {
                    const f = this.$store.getters[`${this.resourceName}/getFilter`](depName)
                    return f && f.currentValue
                })

                if (depsFilled && this.options.length === 0) {
                    this.debugLog('log', '[SearchableSelect] Reloading options when mounting - dependencies filled')
                    this.fetchOptions()
                }
            }
        },

        setupDependencyWatchers() {
            if (!this.filter.dependentOf || this.filter.dependentOf.length === 0) return
            this.filter.dependentOf.forEach(dep => {
                this.$watch(
                    () => this.$store.getters[`${this.resourceName}/getFilter`](dep).currentValue,
                    (newVal, oldVal) => {
                        this.debugLog('log', `[SearchableSelect] Dependence ${dep} changed from ${oldVal} to ${newVal}`)
                        this.handleDependencyChange()
                    }
                )
            })
        },

        handleDependencyChange() {
            const depsFilled = this.filter.dependentOf.every(depName => {
                const f = this.$store.getters[`${this.resourceName}/getFilter`](depName)
                return f && f.currentValue
            })

            if (!depsFilled) {
                this.options = []
                if (this.initialized && this.value) {
                    this.debugLog('log', '[SearchableSelect] Clearing selection - unfulfilled dependencies')
                    this.handleClear()
                }
                return
            }

            this.debugLog('log', '[SearchableSelect] Looking for options...')
            this.fetchOptions()
        },

        async fetchOptions() {
            this.loading = true

            const currentValue = this.value

            try {
                const filters = this.filter.dependentOf.reduce((acc, name) => {
                    acc[name] = this.$store.getters[`${this.resourceName}/getFilter`](name).currentValue
                    return acc
                }, {})

                const lens = this.lens ? `/lens/${this.lens}` : ''
                const {data: options} = await Nova.request().get(
                    `/nova-api/${this.resourceName}${lens}/filters/options`,
                    {
                        params: {
                            filters: btoa(JSON.stringify(filters)),
                            filter: this.filterKey,
                        },
                    }
                )

                this.options = options || []
                this.debugLog('log', '[SearchableSelect] Loaded options:', this.options.length)
                const stillValid = this.options.some(opt => opt.value === currentValue)

                if (!stillValid && this.initialized && this.value) {
                    this.debugLog('error', '[SearchableSelect] Invalid current value, clearing')
                    this.handleClear()
                }

            } catch (error) {
                this.debugLog('error', '[SearchableSelect] Error loading options:', error)
                this.options = []
            } finally {
                this.loading = false
            }
        },

        performSearch(event) {
            this.debugLog('log', '[SearchableSelect] Searching', event)
            this.search = event
        },

        handleClear() {
            this.debugLog('log', '[SearchableSelect] Clearing selection')
            this.search = ''
            this.handleChange('')
        },

        handleChange(value) {
            this.debugLog('log', '[SearchableSelect] Changing value to:', value)
            this.$store.commit(`${this.resourceName}/updateFilterState`, {
                filterClass: this.filterKey,
                value: value || '',
            })
            this.$emit('change')
        },

        handleClickOutside(event) {
            if (!this.$el.contains(event.target)) {
                //Remove dropdown logic as Nova's Search Input manages this
            }
        },
        debugLog(level, ...args) {
            if (!this.debug) return
            if (typeof console[level] === 'function') {
                console[level](...args)
            } else {
                console.log(...args)
            }
        }
    },

    computed: {
        filter() {
            return this.$store.getters[`${this.resourceName}/getFilter`](this.filterKey)
        },

        value: {
            get() {
                return this.filter.currentValue
            },
            set(value) {
                this.handleChange(value)
            }
        },

        selectedOption() {
            return this.options.find(
                o => this.value === o.value || this.value === o.value.toString()
            )
        },

        availableOptions() {
            let options = [...this.options]

            if (this.filter.dependentOf && this.filter.dependentOf.length > 0) {
                options = _.filter(options, option => {
                    return !option.hasOwnProperty('depends') ||
                        _.every(option.depends, (values, filterName) => {
                            const depFilter = this.$store.getters[`${this.resourceName}/getFilter`](filterName)
                            if (!depFilter) return true
                            return _.intersection(
                                _.castArray(depFilter.currentValue).map(String),
                                _.castArray(values).map(String)
                            ).length > 0
                        })
                })
            }

            return options
        },

        filteredOptions() {
            return this.availableOptions.filter(option => {
                return (
                    option.label
                        .toString()
                        .toLowerCase()
                        .indexOf(this.search.toLowerCase()) > -1
                )
            })
        }
    },
}
</script>
