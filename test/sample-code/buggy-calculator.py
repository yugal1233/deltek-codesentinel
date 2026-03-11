# Sample Python file with intentional bugs for testing

class Calculator:
    def __init__(self):
        self.history = []

    # Bug: Division by zero not handled
    def divide(self, a, b):
        result = a / b  # Will crash if b is 0
        self.history.append(result)
        return result

    # Bug: Off-by-one error
    def get_last_n_results(self, n):
        # BUG: Should be -n: not -n-1:
        return self.history[-n-1:]

    # Performance Issue: Inefficient algorithm
    def is_prime(self, n):
        if n < 2:
            return False
        # PERFORMANCE: Checking all numbers up to n instead of sqrt(n)
        for i in range(2, n):
            if n % i == 0:
                return False
        return True

    # Code Quality: Poor naming and no error handling
    def calc(self, x, y, op):
        # Poor naming: what does 'op' mean? what are x and y?
        if op == '+':
            return x + y
        elif op == '-':
            return x - y
        elif op == '*':
            return x * y
        elif op == '/':
            return x / y  # No error handling
        # Missing else case - returns None

# Bug: Global mutable default argument
def add_to_list(item, list=[]):
    # BUG: Mutable default argument
    list.append(item)
    return list

# Security Issue: Using eval
def calculate_expression(expression):
    # SECURITY: eval() can execute arbitrary code
    result = eval(expression)
    return result

# Best Practice Issue: No docstrings
def complex_calculation(data):
    result = 0
    for item in data:
        if item > 0:
            result += item * 2
        else:
            result -= item
    return result
