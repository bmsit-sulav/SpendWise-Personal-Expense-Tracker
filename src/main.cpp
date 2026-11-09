#include <iostream>
#include <stdlib.h>
#include<vector>
#include<string>
#include "Expense.h"
using namespace std;

int main(){
    Expense e(1, 150, "2026-11-09", "Food", "Lunch");
    cout<<e.getId()<<endl;
    return 0;
}